Fetch User Information
By FIDs
Fetches information about multiple users based on FIDs

GET
/
farcaster
/
user
/
bulk

Try it
Authorizations
​
x-api-key
stringheaderdefault:NEYNAR_API_DOCSrequired
API key to authorize requests

Headers
​
x-neynar-experimental
booleandefault:false
Enables experimental features including filtering based on the Neynar score. See docs for more details.

Query Parameters
​
fids
stringrequired
Comma separated list of FIDs, up to 100 at a time

​
viewer_fid
integer
The unique identifier of a farcaster user (unsigned integer)

Example:
3

Response
200

200
application/json
Successful operation.

​
users
object[]required

Show child attributes

Was this page helpful?


Yes

No
Search for Usernames
By Eth or Sol addresses
telegram
github
Powered by Mintlify

cURL

Python

JavaScript

PHP

Go

Java

Copy
curl --request GET \
  --url https://api.neynar.com/v2/farcaster/user/bulk \
  --header 'x-api-key: <api-key>'

200

400

Copy
{
  "users": [
    {
      "object": "user",
      "fid": 3,
      "username": "<string>",
      "display_name": "<string>",
      "custody_address": "0x5a927ac639636e534b678e81768ca19e2c6280b7",
      "pfp_url": "<string>",
      "profile": {
        "bio": {
          "text": "<string>",
          "mentioned_profiles": [
            {
              "object": "user_dehydrated",
              "fid": 3,
              "username": "<string>",
              "display_name": "<string>",
              "pfp_url": "<string>",
              "custody_address": "0x5a927ac639636e534b678e81768ca19e2c6280b7"
            }
          ],
          "mentioned_profiles_ranges": [
            {
              "start": 1,
              "end": 1
            }
          ],
          "mentioned_channels": [
            {
              "id": "<string>",
              "name": "<string>",
              "object": "channel_dehydrated",
              "image_url": "<string>",
              "viewer_context": {
                "following": true,
                "role": "member"
              }
            }
          ],
          "mentioned_channels_ranges": [
            {
              "start": 1,
              "end": 1
            }
          ]
        },
        "location": {
          "latitude": 0,
          "longitude": 0,
          "radius": 1,
          "address": {
            "city": "<string>",
            "state": "<string>",
            "state_code": "<string>",
            "country": "<string>",
            "country_code": "<string>"
          }
        }
      },
      "follower_count": 123,
      "following_count": 123,
      "verifications": [
        "0x5a927ac639636e534b678e81768ca19e2c6280b7"
      ],
      "verified_addresses": {
        "eth_addresses": [
          "0x5a927ac639636e534b678e81768ca19e2c6280b7"
        ],
        "sol_addresses": [
          "<string>"
        ],
        "primary": {
          "eth_address": "0x5a927ac639636e534b678e81768ca19e2c6280b7",
          "sol_address": "<string>"
        }
      },
      "verified_accounts": [
        {
          "platform": "x",
          "username": "<string>"

