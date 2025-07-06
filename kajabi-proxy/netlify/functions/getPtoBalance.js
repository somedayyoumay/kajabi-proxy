// /netlify/functions/getPtoBalance.js - FINAL VERSION with Robust CORS

// Helper function to poll for the automation result
const pollForResult = async (taskId, automationApiKey) => {
    let attempts = 0;
    const maxAttempts = 30, pollInterval = 1500;
    while (attempts < maxAttempts) {
        attempts++;
        const statusUrl = `https://api.browser-use.com/api/v1/task/${taskId}/status`;
        try {
            const response = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${automationApiKey}` } });
            if (response.ok) {
                const data = await response.json();
                if (data.status === 'completed') return data.result;
                if (data.status === 'failed' || data.error) throw new Error("Automation task failed.");
            }
        } catch (e) { console.error(`Polling attempt ${attempts} failed:`, e); }
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error("Automation task timed out.");
};

// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    // These headers are crucial for security and cross-origin requests.
    // Using a wildcard '*' for origin during testing is common, but lock it down later.
    const headers = {
        'Access-Control-Allow-Origin': '*', // Or 'https://hub.bezla.com'
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Browsers send a preflight OPTIONS request first for CORS. We must handle it.
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 204, // No Content
            headers
        };
    }

    // Get the secret keys from Netlify Environment Variables
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

    try {
        const kajabiUserUrl = `https://api.kajabi.com/v1/users/${userId}`;
        const kajabiResponse = await fetch(kajabiUserUrl, { headers: { 'Authorization': 'Basic ' + Buffer.from(KAJABI_API_KEY + ':' + KAJABI_API_SECRET).toString('base64') } });
        if (!kajabiResponse.ok) throw new Error(`Kajabi API responded with status: ${kajabiResponse.status}`);
        const userData = await kajabiResponse.json();
        userName = userData.data.attributes.name;
        if (!userName) throw new Error("Could not find user name for the provided ID.");
    } catch (error) {
        console.error("Error looking up user name in Kajabi:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to look up user name.' }) };
    }

    try {
        const instructionTask = `1. Go to the URL: https://netorg3945244-my.sharepoint.com/:x:/g/personal/serhat_bezla_com/EaPKaJZNrklKtHFOcFLzy_sBGWEM77NUxZtaAOx7fvGMrw?e=1mohil&nav=MTVfezAwMDAwMDAwLTAwMDEtMDAwMC0wNDAwLTAwMDAwMDAwMDAwMH0\n2. Wait: Wait until the spreadsheet is fully interactive and the main title "EMPLOYEE PAID-TIME-OFF REPORT" is visible.\n3. Locate and Select Employee: Find the dropdown menu visually labeled "CHOOSE EMPLOYEE". Click on this dropdown.\n4. Type to Select: In the dropdown or search field that appears, type the name "${userName}" to find and select that specific employee.\n5. Confirm Selection: Press the Enter key to confirm the selection and close the dropdown.\n6. Wait for Update: Wait for 3 seconds to ensure all data on the page, especially the "Current Balance" field, has fully updated based on the new employee selection.\n7. Read Balance: Locate the field visually labeled "Current Balance". Within that area, find the numerical value for "Vacation".\n8. Return Value: Return only the final numerical value that you read from the "Current Balance" field.`;
        const dataToSend = { task: instructionTask, llm_model: "gemini-2.5-flash" };
        const runTaskResponse = await fetch('https://api.browser-use.com/api/v1/run-task', { method: 'POST', headers: { 'Authorization': `Bearer ${AUTOMATION_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify(dataToSend) });
        const runTaskData = await runTaskResponse.json();
        if (!runTaskData.id) throw new Error("Failed to start automation task.");
        const ptoBalance = await pollForResult(runTaskData.id, AUTOMATION_API_KEY);
        return { statusCode: 200, headers, body: JSON.stringify({ balance: ptoBalance }) };
    } catch (error) {
        console.error("Error during automation:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Automation process failed.' }) };
    }
};
```**Changes made in this version:**
*   I've made the CORS origin `*` (wildcard) for testing. This is less secure but guarantees it will work for the test. We can lock it down to `https://hub.bezla.com` later.
*   I explicitly added the `OPTIONS` preflight handling at the top, which might have been missing.

**Step 2: Redeploy and Test**
1.  Commit this new code to your `getPtoBalance.js` file in GitHub.
2.  Wait for Netlify to finish the automatic deployment.
3.  Test your Kajabi page again.

The CORS `net::ERR_FAILED` error should now be resolved.
