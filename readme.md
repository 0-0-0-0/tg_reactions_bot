This is a Telegram bot that allows to react to media messages with arbitrary emojis (or any short text).
These reactions are shown as an inline keyboard, not native Telegram reactions.

No web framework was used, just the `https` Node module and `mongoose` for the database.


### .env variables


BOT_TOKEN           - Telegram bot API token

DB_PATH             - DB path for MongoDB

METHOD              - method for receiving updates. Permitted values: LONG_POLLING, WEBHOOKS

POLLING_TIMEOUT     - timeout for long polling (in seconds)

WEBHOOK_URL         - webhook URL

PORT                - webhook port
