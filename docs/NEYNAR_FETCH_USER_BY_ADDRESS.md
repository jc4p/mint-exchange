Fetch User Information
By Eth or Sol addresses
Fetches all users based on multiple Ethereum or Solana addresses.

Each farcaster user has a custody Ethereum address and optionally verified Ethereum or Solana addresses. This endpoint returns all users that have any of the given addresses as their custody or verified Ethereum or Solana addresses.

A custody address can be associated with only 1 farcaster user at a time but a verified address can be associated with multiple users. You can pass in Ethereum and Solana addresses, comma separated, in the same request. The response will contain users associated with the given addresses.

GET
/
farcaster
/
user
/
bulk-by-address

Try it
​
See related guide: User by wallet address
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
addresses
stringrequired
Comma separated list of Ethereum addresses, up to 350 at a time

​
address_types
enum<string>[]
Customize which address types the request should search for. This is a comma-separated string that can include the following values: 'custody_address' and 'verified_address'. By default api returns both. To select multiple types, use a comma-separated list of these values.


Show child attributes

​
viewer_fid
integer
The unique identifier of a farcaster user or app (unsigned integer)

Example:
3

Response
200

200
application/json
Successful operation.

​
{key}
object[]

Show child attributes

Was this page helpful?


Yes

No
By FIDs (Farcaster IDs)
By custody-address
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
  --url https://api.neynar.com/v2/farcaster/user/bulk-by-address \
  --header 'x-api-key: <api-key>'

200

400

404

Copy
{}
