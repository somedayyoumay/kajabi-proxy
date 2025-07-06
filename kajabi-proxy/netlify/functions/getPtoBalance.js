// /netlify/functions/getPtoBalance.js - FINAL VERSION

const pollForResult = async (taskId, automationApiKey) => {
    // ... (polling logic is unchanged) ...
};

exports.handler = async (event, context) => {
    // ... (headers and OPTIONS request handling is unchanged) ...
    
    // Get secrets from Netlify Environment Variables
    const { KAJABI_API_KEY, KAJABI_API_SECRET, AUTOMATION_API_KEY } = process.env;

    // ... (logic to get userId from request body is unchanged) ...

    // STEP 2 (Corrected): Use Kajabi GraphQL API to get the name for this ID
    try {
        // ... (This block now uses the correct KAJABI_API_KEY and KAJABI_API_SECRET from environment variables) ...
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
        // ... (rest of the try...catch block is unchanged) ...
    } catch (error) {
        // ...
    }

    // ... (rest of the automation triggering logic is unchanged) ...
};
