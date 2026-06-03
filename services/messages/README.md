# Messages Service

Purpose: read iMessage/SMS data from the Mac mini and make it available for search, analytics, check-ins, people context, and history extraction.

First build:

- read `~/Library/Messages/chat.db`
- normalize messages into an Eidos database
- resolve contacts from AddressBook plus persisted aliases
- expose search and analytics
- never mutate Messages

Known hard parts:

- phone/email/handle/group-chat identity resolution
- attributedBody text extraction
- attachment handling
- spam/verification-code filtering
- sync freshness

