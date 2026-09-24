# Auth Testing Playbook — Stream Anywhere

## Step 1: MongoDB
```
mongosh
use stream_anywhere
db.users.find({role: "admin"}).pretty()
```
Verify bcrypt hash starts with `$2b$`, unique index on users.email.

## Step 2: API (use external URL for e2e)
```
API=https://stream-pro-78.preview.emergentagent.com
curl -c c.txt -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@streamanywhere.io","password":"Broadcast2026!"}'
curl -b c.txt $API/api/auth/me
```
Login returns `{user, access_token}` and sets cookies. `/me` returns same user.
Token may also be sent via `Authorization: Bearer <access_token>`.
