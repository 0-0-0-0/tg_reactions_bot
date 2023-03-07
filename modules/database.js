require('dotenv').config();

const dbPath = process.env.DB_PATH;

const mongoose = require('mongoose');


mongoose.set('strictQuery', true);
mongoose.connection.on('open', (event) => {
    console.log('DB connected.');
});
mongoose.connection.on('reconnected', (event) => {
    console.log('DB reconnected.');
});
mongoose.connection.on('reconnectFailed', (event) => {
    console.error('DB reconnect failed.');
});
mongoose.connection.on('disconnecting', (event) => {
    console.log('Closing DB connection...');
});
mongoose.connection.on('close', (event) => {
    console.log('DB connection closed.');
});

async function start() {
    try{
        const options = { keepAlive: true, keepAliveInitialDelay: 300000 };
        await mongoose.connect(dbPath, options);
    }
    catch(error) {
        console.error('Database error (connection):');
        console.error(error);
    }
}

function stop() {
    mongoose.connection.close();
}

function initSchema() {
    try{
        const Reaction = mongoose.model('Reaction', new mongoose.Schema({
            chat_id: Number,
            message_id: Number,
            user_id: Number,
            text: String,
        }));
        const ChatSettings = mongoose.model('ChatSettings', new mongoose.Schema({
            chat_id: Number,
            defaultReactions: [String],
        }));
        return {
            Reaction,
            ChatSettings,
        };
    }
    catch(error) {
        console.log('Database error (mongodb schema):');
        console.log(error);
        throw error;
    }
}

function saveReaction(chat_id, message_id, user_id, text) {
    const reaction = new Reaction({
        chat_id: chat_id,
        message_id: message_id,
        user_id: user_id,
        text: text,
    });

    return reaction.save();
}

async function getReaction(chat_id, message_id, user_id) {
    return await Reaction.findOne({
        chat_id: chat_id,
        message_id: message_id,
        user_id: user_id
    }).exec();
}

async function countReactions(chat_id, message_id) {
    return await Reaction.aggregate([
        {
            $match: {message_id: message_id}
        },
        {
            $group: {
                _id: '$text',
                count: {$count: {}}
            }
        }
    ]).exec();
}

async function deleteReaction(chat_id, message_id, user_id) {
    return await Reaction.deleteOne({
        chat_id: chat_id,
        message_id: message_id,
        user_id: user_id
    }).exec();
}

function saveChatSettings(chat_id, settings) {
    ChatSettings.findOneAndUpdate(
        {chat_id: chat_id},
        settings,
        {upsert: true, new: true},
        (err, chatSettings) => {
            console.error(err);
        }
    );
}

async function getChatSettings(chat_id)
{
    return await ChatSettings.findOne(
        {chat_id: chat_id},
    ).exec();
}

const {
    Reaction,
    ChatSettings
} = initSchema();

module.exports = {
    start,
    stop,
    saveReaction,
    deleteReaction,
    getReaction,
    countReactions,
    saveChatSettings,
    getChatSettings,
};