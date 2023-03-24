require('dotenv').config();

const api = require('./modules/tgBotApi');
const keyboards = require('./modules/keyboards');
const db = require('./modules/database');

var me;
var lastMediaGroupId;


async function handleBotCommand(entity, message) {
    command = message.text.slice(entity.offset, entity.offset + entity.length);
    [command, bot] = command.split('@');
    if(bot && bot !== me.username) { return; }

    switch(command) {
        case '/help':
            api.sendStandardMessage(message.chat.id, command);
            break;
        case '/edit':
            let userCanEdit = true;

            if(message.chat.type !== "private") {
                const chatMember = await api.callApiMethod('getChatMember', {chat_id: message.chat.id, user_id: message.from.id});
                const allowedStatuses = ['owner', 'administrator'];
                userCanEdit = allowedStatuses.includes(chatMember.status);
            }

            if(userCanEdit) {
                const restOfTheMessage = message.text.slice(entity.offset + entity.length);
                reactions = restOfTheMessage.trim().split(/\s+/);
                reactions = new Set(reactions);
                reactions.delete('');
                reactions = [...reactions];
                chatSettings = db.saveChatSettings(message.chat.id, {defaultReactions: reactions});
            }
            else {
                api.sendStandardMessage(message.chat.id, 'permissionAdmin', message.message_id);
            }

            break;
    }
}

//TODO replace consecutive awaits with Promise.all()
// - countReactions, getReaction, getChatSettings
async function handleReaction(message, user_id, newReactionText)
{
    const chat_id = message.chat.id;
    const message_id = message.message_id;

    const dbReactionCount = await db.countReactions(chat_id, message_id);
    var reactionCount = new Map();
    for(countAggregate of dbReactionCount) {
        reactionCount.set(countAggregate._id, countAggregate.count);
    }

    const oldReaction = await db.getReaction(chat_id, message_id, user_id);
    if(oldReaction !== null) {
        const oldReactionText = oldReaction.text;
        db.deleteReaction(chat_id, message_id, user_id);
        var oldReactionCount = reactionCount.get(oldReactionText);
        --oldReactionCount;
        reactionCount.set(oldReactionText, oldReactionCount);
        if(newReactionText !== oldReactionText) {
            db.saveReaction(chat_id, message_id, user_id, newReactionText);
            var newReactionCount = reactionCount.get(newReactionText);
            if(isNaN(newReactionCount)) { newReactionCount = 0; }
            ++newReactionCount;
            reactionCount.set(newReactionText, newReactionCount);
        }
    }
    else {
        db.saveReaction(chat_id, message_id, user_id, newReactionText);
        var newReactionCount = reactionCount.get(newReactionText);
        if(isNaN(newReactionCount)) { newReactionCount = 0; }
        ++newReactionCount;
        reactionCount.set(newReactionText, newReactionCount);
    }

    const chatSettings = await db.getChatSettings(chat_id);
    const defaultReactions = chatSettings.defaultReactions;

    var buttons = [];
    for(text of defaultReactions) {
        if(reactionCount.has(text)) {
            let count = reactionCount.get(text);
            reactionCount.delete(text);
            buttons.push(keyboards.Button.makeWithCount(text, count));
        }
        else {
            buttons.push(keyboards.Button.make(text));
        }
    }
    for([text, count] of reactionCount) {
        if(count > 0) {
            buttons.push(keyboards.Button.makeWithCount(text, count));
        }
    }
    const keyboard = keyboards.makeInlineKeyboard(buttons);
    api.replaceKeyboard(message, keyboard);
}

async function handleUpdate(update) {
    try {
    //handle messages containing bot commands
        if('message' in update && 'entities' in update.message) {
            const message = update.message;
            const entities = message.entities;
            const commandEntities = entities.filter((entity) => (entity.type == 'bot_command'));
            if(commandEntities.length) {
                for(entity of commandEntities) {
                    handleBotCommand(entity, message);
                }
                return;
            }
        }

        //handle formatted replies
        if('message' in update && 'reply_to_message' in update.message) {
            const message = update.message;
            const reply_to_message = message.reply_to_message;
            if(reply_to_message.from.id == me.id && message.text && '+' === message.text.charAt(0)) {
                handleReaction(reply_to_message, message.from.id, message.text.slice(1));
                api.deleteMessage(message);
                return;
            }
        }

        //any other messages sent to the chat
        if('message' in update) {
            const message = update.message;
            if(message.from.id == me.id) { return; }
            if(message.text) { return; }

            if('media_group_id' in message) {
                if(message.media_group_id != lastMediaGroupId) {
                    lastMediaGroupId = message.media_group_id;
                }
                else {
                    return;
                }
            }
            else {
                lastMediaGroupId = undefined;
            }

            let buttons;
            settings = await db.getChatSettings(message.chat.id);
            if(settings && ('defaultReactions' in settings) && settings.defaultReactions.length) {
                buttons = settings.defaultReactions.map(keyboards.Button.make);
            }
            else { buttons = []; }
            const keyboard = keyboards.makeInlineKeyboard(buttons);
            if(lastMediaGroupId) {
                api.replyWithKeyboard(message, keyboard);
            }
            else{
                await api.copyWithKeyboard(message, keyboard);
                api.deleteMessage(message);
            }

            return;
        }

        //a button attached to a message was pressed
        if('callback_query' in update) {
            const {
                id, from, message, data
            } = update.callback_query;

            api.callApiMethod('answerCallbackQuery', {callback_query_id: id});
            handleReaction(message, from.id, data);

            return;
        }
    }
    catch(error) {
        console.error(error.stack);
        if(error instanceof api.TelegramBotApiError) {
            //may or may not want to log/send something to the chat
        }
    }
}

async function main() {
    process.on('SIGINT', function () {
        process.exit(2);
    });
    process.on('uncaughtException', function(e) {
        console.error(e.stack);
        process.exit(99);
    });
    process.on('exit', function(code) {
        console.log('Terminating...');
        db.stop();
    });

    await db.start();
    me = await api.callApiMethod('getMe', {})
    console.log('Bot\'s user id: ' + me.id);

    switch(process.env.METHOD) {
        case 'WEBHOOKS':
            const webhookInfo = await api.callApiMethod('getWebhookInfo');
            if(!webhookInfo) {
                throw new Error("Couldn't get webhook info");
            }
            else {
                console.log(`Webhook url: ${webhookInfo.url}`);
                if(!webhookInfo.url) {
                    throw new Error("Webhook is not set");
                }
            }
            try{
                api.listenForUpdates(handleUpdate);
            }
            catch(error) {
                console.error(`Couldn't start server`);
                console.error(error.stack);
                throw error;
            }
            break;
        case 'LONG_POLLING':
            let offset;
            let updates;
            while(true) {
                try{
                    updates = await api.getUpdates(offset);
                    updates.forEach(handleUpdate);
                    offset = api.calculateOffset(updates);
                }
                catch(error) {
                    if(error instanceof api.TelegramBotApiError) {
                        //may or may not want to log/send something to the chat
                    }
                    else {
                        throw error;
                    }
                }
            }
        default:
            throw new Error('Invalid configuration: no method for getting updates');
    }
}


main();