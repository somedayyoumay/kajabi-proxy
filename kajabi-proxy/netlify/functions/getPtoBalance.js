// ... (inside the handler function)
} catch (error) {
    console.error("Error looking up user name in Kajabi:", error); // This is line 58
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to look up user name.' }) };
}
```Wait, that's the error *handler*. Let's look at the `try` block just before it. The `SyntaxError` is coming from trying to parse a response from the Kajabi API.

Specifically, this line is the culprit:
`const userData = await kajabiResponse.json();`

The error "Unexpected end of JSON input" means that the `fetch` call to the Kajabi GraphQL API succeeded, but the **response body was empty or not valid JSON**, so `JSON.parse()` failed.

**Why would the response be empty?**

This almost always happens when an API call fails authentication. The server sends back an error page (which is often HTML or plain text, not JSON) or an empty body with a `401 Unauthorized` or `403 Forbidden` status. Our code, however, has a check for this: `if (!kajabiResponse.ok)`. It seems that even if the authentication fails, Kajabi might be sending back a `200 OK` status with a non-JSON body, which is unusual API behavior but possible.

**Let's make our function more robust to handle this possibility.**

We will add a `try...catch` block specifically around the `kajabiResponse.json()` part to see what the raw text of the response is.

---

### Final Netlify Function Code (`getPtoBalance.js`)

Please update your `getPtoBalance.js` file in GitHub one last time with this version. It adds better error handling to show us exactly what Kajabi is sending back.

```javascript
// /netlify/functions/getPtoBalance.js - FINAL VERSION with Robust Error Logging

const pollForResult = async (taskId, automationApiKey) => {
    // ... (polling logic is unchanged) ...
};

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': 'https://hub.bezla.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };
    if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers };

    const { KAJABI_API_KEY, KAJABI_API_SECRET, AUTOMATION_API_KEY } = process.env;

    if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ error: "Request body missing." }) };
    
    let userId, userName;
    try {
        const body = JSON.parse(event.body);
        userId = body.userId;
        if (!userId) throw new Error("Missing userId.");
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body or missing userId." }) };
    }

    // STEP 2: Use Kajabi GraphQL API to get the name for this ID
    try {
        console.log(`Looking up Kajabi name for userId: ${userId}`);
        const kajabiApiUrl = 'https://api.kajabi.com/v2/graphql';
        const graphqlQuery = { query: `query($id: ID!) { user(id: $id) { name } }`, variables: { id: userId } };
        
        const kajabiResponse = await fetch(kajabiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(KAJABI_API_KEY + ':' + KAJABI_API_SECRET).toString('base64')
            },
            body: JSON.stringify(graphqlQuery)
        });

        if (!kajabiResponse.ok) {
             const errorText = await kajabiResponse.text();
             console.error("Kajabi API Error Response (Text):", errorText);
             throw new Error(`Kajabi API responded with non-OK status: ${kajabiResponse.status}`);
        }
        
        // ---- NEW Robust JSON Parsing ----
        const responseText = await kajabiResponse.text();
        let userData;
        try {
            userData = JSON.parse(responseText);
        } catch (jsonError) {
            console.error("Failed to parse Kajabi API response as JSON.", jsonError);
            console.error("Raw response text from Kajabi:", responseText);
            throw new Error("Kajabi API returned non-JSON response.");
        }
        // ---- End of New Parsing ----

        userName = userData.data.user.name;
        if (!userName) throw new Error("Could not find user name in GraphQL response.");
        console.log(`Successfully found name: ${userName}`);

    } catch (error) {
        console.error("Error looking up user name in Kajabi:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to look up user name.' }) };
    }

    // STEP 3 & 4: Trigger automation and poll for result (this part is unchanged)
    // ...
};
