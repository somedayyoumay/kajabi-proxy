// This is the full and correct code for: /netlify/functions/getPtoBalance.js

// Helper function to poll for the automation result
const pollForResult = async (taskId, automationApiKey) => {
    let attempts = 0;
    const maxAttempts = 30; // Try for 45 seconds
    const pollInterval = 1500; // 1.5 seconds

    while (attempts < maxAttempts) {
        attempts++;
        console.log(`Polling for task result (ID: ${taskId}, Attempt: ${attempts})`);
        
        const statusUrl = `https://api.browser-use.com/api/v1/task/${taskId}/status`;
        const response = await fetch(statusUrl, {
            headers: { 'Authorization': `Bearer ${automationApiKey}` }
        });
        
        if (!response.ok) {
            console.error(`Status check failed with status: ${response.status}`);
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue; // Continue polling even if one check fails
        }

        const data = await response.json();
        console.log("Task status response:", data);

        if (data.status === 'completed') return data.result; // Success!
        if (data.status === 'failed' || data.error) throw new Error("Automation task failed to run.");
        
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error("Automation task timed out.");
};


// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    // These headers are crucial for security and cross-origin requests.
    const headers = {
        'Access-Control-Allow-Origin': 'https://hub.bezla.com', // Only allows your Kajabi site
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
    };

    // Respond to preflight (OPTIONS) requests
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    // Get the secret keys from Netlify Environment Variables
    const { KAJABI_API_KEY, KAJABI_API_SECRET, AUTOMATION_API_KEY } = process.env;

    // STEP 1: Get the current user's details from Kajabi using their cookie
    const kajabiUserCookie = event.headers.cookie;
    if (!kajabiUserCookie) {
        return { statusCode: 401, headers, body: JSON.stringify({ error: 'User is not authenticated.' }) };
    }
    
    let userName;
    try {
        console.log("Fetching user from Kajabi /v1/me endpoint...");
        const kajabiResponse = await fetch('https://api.kajabi.com/v1/me', {
            headers: {
                'Cookie': kajabiUserCookie, // Pass the user's cookie to identify them to Kajabi
            }
        });

        if (!kajabiResponse.ok) throw new Error(`Kajabi API responded with status: ${kajabiResponse.status}`);
        
        const userData = await kajabiResponse.json();
        userName = userData.data.attributes.name;

        if (!userName) throw new Error("Could not find user name in Kajabi API response.");
        console.log(`Successfully identified user: ${userName}`);

    } catch (error) {
        console.error("Error fetching user from Kajabi:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to get user info from Kajabi.' }) };
    }

    // STEP 2 & 3: Trigger the automation and poll for the result
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

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ balance: ptoBalance })
        };

    } catch (error) {
        console.error("Error during automation:", error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Automation process failed.' }) };
    }
};
