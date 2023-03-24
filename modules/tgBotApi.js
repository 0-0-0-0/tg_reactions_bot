require('dotenv').config();

const pollingTimeout = +process.env.POLLING_TIMEOUT;
const apiurl = `https://api.telegram.org/bot${process.env.BOT_TOKEN}/`;

const https = require('https');

let presetMessages = new Map();

helpMessage = 'Available commands\n\n'
    + '/help - show list of available commands\n'
    + '/edit - specify default reactions for new messages in this chat\n';
presetMessages.set('/help', helpMessage);

presetMessages.set('setDefaults', 'No reactions are selected for this chat. Set default reactions for new messages using /edit');
presetMessages.set('permissionDelete', 'I need permission to delete messages');
presetMessages.set('permissionAdmin', 'Only chat administrators can do that');
presetMessages.set('permissionOwner', 'Only the chat owner can do that');


class TelegramBotApiError extends Error {
    constructor(message, apiResponse) {
        super(message);
        this.apiResponse = apiResponse;
    }
}

function calculateOffset(updates) {
    switch(updates.length) {
        case 0: {
            return undefined;
        }
        case 1: {
            let mostRecentUpdate = updates[0];
            return mostRecentUpdate.update_id + 1;
        }
        default: {
            let mostRecentUpdate = updates.reduce((mostRecentUpdate, update) => {
                return update.update_id > mostRecentUpdate.update_id ? update : mostRecentUpdate;
            });
            return mostRecentUpdate.update_id + 1;
        }
    }
}

async function callApiMethod(methodName, methodParams={}) {
    return new Promise((resolve, reject) => {
        const requestJson = JSON.stringify(methodParams);
        const requestOptions = {
            headers: {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(requestJson)
            }
        };

        const req = https.request(apiurl + methodName, requestOptions);
        req.on('response', (res) => {
            var responseJson = '';
            res.on('data', (chunk) => { responseJson += chunk; });
            res.on('end', () => {
                apiResponse = JSON.parse(responseJson);
                if(apiResponse.ok) {
                    resolve(apiResponse.result);
                }
                else {
                    console.error(`API error ${apiResponse.error_code} in ${methodName}`);
                    console.error(apiResponse.description);
                    reject(new TelegramBotApiError(apiResponse.description, apiResponse));
                }
            });
            res.on('error', (e) => {
                console.error(`Response error of type ${typeof e} in ${methodName}`);
                console.error(e);
                reject(e);
            });
        });
        req.on('error', (e) => {
            console.error(`Request error of type ${typeof e} in ${methodName}`);
            console.error(e);
            reject(e);
        });

        req.write(requestJson);
        req.end();
    });
}

async function getUpdates(offset) {
    const params = {
        "timeout": pollingTimeout,
        "offset": offset,
    };

    return callApiMethod('getUpdates', params);
}

function listenForUpdates(handler) {
    const server = https.createServer();
    console.log("Created server");
    server.on('request', (req, res) => {
        console.debug(`in request start`);
        let requestJson = '';
        req.on('data', (chunk) => { requestJson += chunk });
        req.on('end', () => {
            console.log(`in request end`);
            const update = JSON.parse(requestJson);
            handler(update);
            res.statusCode = 200;
            res.end();
            console.log(`out response end`);
        });
        req.on('error', (e) => {
            console.error(`Incoming request error`);
            console.error(e);
        });
    });
    console.log("Attached event listeners");
    const PORT = process.env.PORT || 443;
    console.log("PORT: " + PORT);
    server.listen(PORT, () => {`Listening to port ${PORT}`});
    console.log("Called server.listen()");
}

async function deleteMessage(message) {
    const params = {
        chat_id: message.chat.id,
        message_id: message.message_id
    };

    return callApiMethod('deleteMessage', params);
}

async function copyWithKeyboard(message, keyboard) {
    let params = {
        from_chat_id: message.chat.id,
        message_id: message.message_id,
        chat_id: message.chat.id,
        reply_markup: keyboard,
        disable_notification: true,
    };
    if(message.reply_to_message) {
        params.reply_to_message_id = message.reply_to_message.message_id;
        params.allow_sending_without_reply = true;
    }

    return callApiMethod('copyMessage', params);
}

async function replyWithKeyboard(message, keyboard, text='^') {
    const params = {
        reply_to_message_id: message.message_id,
        chat_id: message.chat.id,
        text: text,
        reply_markup: keyboard,
        disable_notification: true,
    }

    return callApiMethod('sendMessage', params);
}

async function replaceKeyboard(message, keyboard) {
    const params = {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: keyboard,
    };

    return callApiMethod('editMessageReplyMarkup', params);
}

async function sendTextMessage(chat_id, text, reply_to=undefined) {
    const params = {
        chat_id: chat_id,
        text: text
    }
    if(reply_to !== undefined) {
        params.reply_to_message_id = reply_to;
    }

    return callApiMethod('sendMessage', params);
}

async function sendStandardMessage(chat_id, messageKey, reply_to=undefined) {
    return sendTextMessage(chat_id, presetMessages.get(messageKey), reply_to);
}

module.exports = {
    TelegramBotApiError,
    calculateOffset,
    callApiMethod,
    getUpdates,
    listenForUpdates,
    copyWithKeyboard,
    replyWithKeyboard,
    replaceKeyboard,
    deleteMessage,
    sendTextMessage,
    sendStandardMessage,
}