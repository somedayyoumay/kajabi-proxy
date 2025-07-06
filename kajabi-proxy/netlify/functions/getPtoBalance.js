// FINAL VERSION for /netlify/functions/getPtoBalance.js

// Helper function to poll for the automation result
const pollForResult = async (taskId, automationApiKey) => {
    let attempts = 0;
    const maxAttempts = 30; // Try for 45 seconds
    const pollInterval = 1500; // 1.5 seconds

    while (attempts < maxAttempts) {
        attempts++;
        console.log(`Polling for task result (ID: ${taskId}, Attempt: ${attempts})`);
        
        try {
            const statusUrl = `https://api.browser-use.com/api/v1/task/${taskId}/status`;
            const response = await fetch(statusUrl, { headers: { 'Authorization': `Bearer ${automationApiKey}` } });
            if (response.ok) {
                const data = await response.json();
                console.log("Task status response:", data);
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
    const headers = {
        'Access-Control-Allow-Origin': 'https://hub.bezla.com',
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
    const { AUTOMATION_API_KEY } = process.env;

    // Get the userName from the request body sent by the Kajabi script
    if (!event.body) return { statusCode: 400, headers, body: JSON.stringify({ error: "Request body missing." }) };
    
    let userName;
    try {
        const body = JSON.parse(event.body);
        userName = body.userName;
        if (!userName) throw new Error("Missing userName.");
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body or missing userName." }) };
    }

    // Trigger the automation and poll for the result
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
