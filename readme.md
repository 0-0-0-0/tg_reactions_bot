This is a Telegram bot intended as exercise with NodeJS

The bot allows to react to media messages with arbitrary emoji or text reactions.
These reactions are shown as buttons under the message (an inline keyboard, not the native reactions feature).

No web framework was used, just `https` and `mongoose` for the database.


### .env variables


BOT_TOKEN

METHOD              - method for receiving updates. Permitted values: LONG_POLLING

POLLING_TIMEOUT     - timeout for long polling (in seconds)

DB_PATH             - DB path for MongoDB
