// require('dotenv').config();

const api = require('./modules/tgBotApi');
const keyboards = require('./modules/keyboards');
const db = require('./modules/database');
const { Button } = require('./modules/keyboards');

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
                const chatMember = api.callApiMethod('getChatMember', {chat_id: message.chat.id, user_id: message.from.id});
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

/**
 * handle callback query from an inline keyboard
 * @param {*} callback_query
 */
async function handleCallbackQuery(callback_query) {
    const {
        id, from, message, data
    } = callback_query;

    //TODO maybe: make the call async, don't wait for resolution
    api.callApiMethod('answerCallbackQuery', {callback_query_id: id});
    handleReaction(message, from.id, data);
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
            buttons.push(Button.makeWithCount(text, count));
        }
        else {
            buttons.push(Button.make(text));
        }
    }
    for([text, count] of reactionCount) {
        if(count > 0) {
            buttons.push(Button.makeWithCount(text, count));
        }
    }
    const keyboard = keyboards.makeInlineKeyboard(buttons);
    api.replaceKeyboard(message, keyboard);
}

async function handleUpdate(update) {
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

        settings = await db.getChatSettings(message.chat.id);
        if(settings && ('defaultReactions' in settings) && settings.defaultReactions.length) {
            const buttons = settings.defaultReactions.map(keyboards.Button.make);
        }
        else { buttons = []; }
        const keyboard = keyboards.makeInlineKeyboard(buttons);
        if(lastMediaGroupId) {
            api.replyWithKeyboard(message, keyboard);
        }
        else{
            api.copyWithKeyboard(message, keyboard);
        }

        return;
    }

    //callback queries from the buttons
    if('callback_query' in update) {
        handleCallbackQuery(update.callback_query);
        return;
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

    db.start();
    api.callApiMethod('getMe', {}, {
        handler: (result) => {
            me = result;
            console.log('Bot\'s user id: ' + me.id);
            api.doLongPolling(handleUpdate);
        }
    })
}


main();