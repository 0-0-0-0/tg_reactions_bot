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


function handleUpdatesFromLongPolling(handleUpdate, updates) {
    switch(updates.length) {
        case 0: {
            console.log('No updates!');
            return undefined;
        }
        case 1: {
            console.log('Single update');
            let mostRecentUpdate = updates[0];
            handleUpdate(mostRecentUpdate);
            return mostRecentUpdate.update_id + 1;
        }
        default: {
            console.log('Many updates:');
            let mostRecentUpdate = updates.reduce((mostRecentUpdate, update) => {
                console.log({mostRecentUpdate: mostRecentUpdate.update_id, update: update.update_id})
                handleUpdate(mostRecentUpdate);
                return update.update_id > mostRecentUpdate.update_id ? update : mostRecentUpdate;
            });
            console.log({mostRecentUpdate: mostRecentUpdate.update_id});
            handleUpdate(mostRecentUpdate);
            return mostRecentUpdate.update_id + 1;
        }
    }
}

function callApiMethod(methodName, methodParams={}, callbacks={}) {
    const {
        after = ()=>{},
        handler = (result)=>{},
        onApiError = (responseObject)=>{},
        onResError = (e)=>{},
        onReqError = (e)=>{},
    } = callbacks;

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
            console.log('Response END');
            responseObject = JSON.parse(responseJson);
            if(responseObject.ok) {
                handler(responseObject.result);
                after();
            }
            else {
                console.error(`API error ${responseObject.error_code} in ${methodName}`);
                console.error(responseObject.description);
                onApiError(responseObject);
            }
        });
        res.on('error', (e) => {
            console.error('Response error');
            console.error(methodName);
            console.error(e);
            onResError(e);
        });
    });
    req.on('error', (e) => {
        console.error('Request error');
        console.error(methodName);
        console.error(e);
        onReqError(e);
    });

    req.write(requestJson);
    req.end();
}

function doLongPolling(handleUpdate, offset) {
    const params = {
        "offset": offset,
        "timeout": pollingTimeout,
    };

    const callbacks = {
        handler: (result) => {
            let offset = handleUpdatesFromLongPolling(handleUpdate, result);
            console.log(`Long polling: OK. Starting anew with offset=${offset}`);
            doLongPolling(handleUpdate, offset);
        },
        onApiError: (responseObject) => {
            doLongPolling(handleUpdate);
        },
        onResError: (e) => {
            doLongPolling(handleUpdate);
        },
        onReqError: (e) => {
            doLongPolling(handleUpdate);
        },
    };

    callApiMethod('getUpdates', params, callbacks);
}

function deleteMessage(message) {
    const params = {
        chat_id: message.chat.id,
        message_id: message.message_id
    };
    const callbacks = {
        handler: (result) => {
            if(!result) {
                sendStandardMessage(message.chat.id, 'permissionDelete');
            }
        },
    };

    callApiMethod('deleteMessage', params, callbacks);
}

function copyWithKeyboard(message, keyboard) {
    const params = {
        from_chat_id: message.chat.id,
        message_id: message.message_id,
        chat_id: message.chat.id,
        reply_markup: keyboard,
    };
    const callbacks = {
        after: () => {
            deleteMessage(message);
        },
    };

    callApiMethod('copyMessage', params, callbacks);
}

function replyWithKeyboard(message, keyboard, text='^') {
    const params = {
        reply_to_message_id: message.message_id,
        chat_id: message.chat.id,
        text: text,
        reply_markup: keyboard,
    }

    callApiMethod('sendMessage', params);
}

function replaceKeyboard(message, keyboard) {
    const params = {
        chat_id: message.chat.id,
        message_id: message.message_id,
        reply_markup: keyboard,
    };

    callApiMethod('editMessageReplyMarkup', params);
}

function sendTextMessage(chat_id, text, reply_to=undefined) {
    const params = {
        chat_id: chat_id,
        text: text
    }
    if(reply_to !== undefined) {
        params.reply_to_message_id = reply_to;
    }

    callApiMethod('sendMessage', params);
}

function sendStandardMessage(chat_id, messageKey, reply_to=undefined) {
    sendTextMessage(chat_id, presetMessages.get(messageKey), reply_to);
}

module.exports = {
    callApiMethod,
    doLongPolling,
    copyWithKeyboard,
    replyWithKeyboard,
    replaceKeyboard,
    deleteMessage,
    sendTextMessage,
    sendStandardMessage,
}