// /netlify/functions/getPtoBalance.js - FINAL VERSION

const pollForResult = async (taskId, automationApiKey) => {
    // (Polling logic remains the same as before...)
    let attempts = 0;
    const maxAttempts = 30, pollInterval = 1500;
    while (attempts < maxAttempts) {
        attempts++;
        const statusUrl = `https://api.browser-use.com/api/v1/task/${taskId}/status`;
        const response = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${automationApiKey}` } });
        if (!response.ok) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
        }
        const data = await response.json();
        if (data.status === 'completed') return data.result;
        if (data.status === 'failed' || data.error) throw new Error("Automation task failed.");
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error("Automation task timed out.");
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

    // STEP 2 (Corrected): Use Kajabi GraphQL API to get the name for this ID
    try {
        console.log(`Looking up Kajabi name for userId: ${userId}`);
        const kajabiApiUrl = 'https://api.kajabi.com/v2/graphql';
        
        // GraphQL query to find a user by their ID
        const graphqlQuery = {
            query: `query($id: ID!) {
                user(id: $id) {
                    name
                }
            }`,
            variables: {
                id: userId
            }
        };
        
        const kajabiResponse = await fetch(kajabiApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Basic ' + Buffer.from(KAJABI_API_KEY + ':' + KAJABI_API_SECRET).toString('base64')
            },
            body: JSON.stringify(graphqlQuery)
        });

        if (!kajabiResponse.ok) {
             const errorBody = await kajabiResponse.json();
             console.error("Kajabi API Error Response:", errorBody);
             throw new Error(`Kajabi API responded with status: ${kajabiResponse.status}`);
        }
        
        const userData = await kajabiResponse.json();
        userName = userData.data.user.name;

        if (!userName) throw new Error("Could not find user name for the provided ID in GraphQL response.");
        console.log(`Successfully found name: ${userName}`);

    } catch (error) {
        console.error("Error looking up user name in Kajabi:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to look up user name.' }) };
    }

    // STEP 3 & 4: Trigger automation and poll for result (this part is unchanged)
    try {
        console.log(`Triggering automation for user: ${userName}`);
        const instructionTask = `1. Go to the URL: https://netorg3945244-my.sharepoint.com/:x:/g/personal/serhat_bezla_com/EaPKaJZNrklKtHFOcFLzy_sBGWEM77NUxZtaAOx7fvGMrw?e=1mohil&nav=MTVfezAwMDAwMDAwLTAwMDEtMDAwMC0wNDAwLTAwMDAwMDAwMDAwMH0\n2. Wait: Wait until the spreadsheet is fully interactive and the main title "EMPLOYEE PAID-TIME-OFF REPORT" is visible.\n3. Locate and Select Employee: Find the dropdown menu visually labeled "CHOOSE EMPLOYEE". Click on this dropdown.\n4. Type to Select: In the dropdown or search field that appears, type the name "${userName}" to find and select that specific employee.\n5. Confirm Selection: Press the Enter key to confirm the selection and close the dropdown.\n6. Wait for Update: Wait for 3 seconds to ensure all data on the page, especially the "Current Balance" field, has fully updated based on the new employee selection.\n7. Read Balance: Locate the field visually labeled "Current Balance". Within that area, find the numerical value for "Vacation".\n8. Return Value: Return only the final numerical value that you read from the "Current Balance" field.`;
        const dataToSend = { task: instructionTask, llm_model: "gemini-2.5-flash" };
        
        const runTaskResponse = await fetch('https://api.browser-use.com/api/v1/run-task', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${AUTOMATION_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(dataToSend)
        });

        const runTaskData = await runTaskResponse.json();
        if (!runTaskData.id) throw new Error("Failed to start automation task.");

        const ptoBalance = await pollForResult(runTaskData.id, AUTOMATION_API_KEY);

        return { statusCode: 200, headers, body: JSON.stringify({ balance: ptoBalance }) };

    } catch (error) {
        console.error("Error during automation:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Automation process failed.' }) };
    }
};
