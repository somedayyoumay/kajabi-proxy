// This is the full code for your Netlify Function: /netlify/functions/getPtoBalance.js

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
        
        // Handle case where status API might not return JSON on failure
        if (!response.ok) {
            console.error(`Status check failed with status: ${response.status}`);
            // Do not throw here, let the loop continue or time out
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            continue;
        }

        const data = await response.json();
        console.log("Task status response:", data);

        if (data.status === 'completed') {
            return data.result; // Success! Return the PTO balance.
        }
        if (data.status === 'failed' || data.error) {
            console.error("Automation task failed:", data.error || "Unknown error");
            throw new Error("Automation task failed to run.");
        }
        // If still running, wait before the next attempt
        await new Promise(resolve => setTimeout(resolve, pollInterval));
    }
    throw new Error("Automation task timed out.");
};


// Main handler for the Netlify Function
exports.handler = async (event, context) => {
    // This allows your Kajabi site to call this function from a browser
    const headers = {
        'Access-Control-Allow-Origin': '*', // Or specify your Kajabi domain for better security
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };
    
    // Respond to preflight requests for CORS
    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 204, headers };
    }

    // Get the secret keys from Netlify Environment Variables
    const { KAJABI_API_KEY, KAJABI_API_SECRET, AUTOMATION_API_KEY } = process.env;

    // We can't use the Kajabi API from a browser context securely, and passing cookies
    // to a serverless function can be complex. The `userInfo` object is our only viable path.
    // Therefore, the Kajabi page needs to get the name and pass it to this function.

    // Let's change the function to receive the name from the Kajabi script.
    if (!event.body) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Request body is missing." }) };
    }
    
    let userName;
    try {
        const body = JSON.parse(event.body);
        userName = body.userName;
        if (!userName) {
            throw new Error();
        }
    } catch (e) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: "Invalid request body or missing userName." }) };
    }


    // Now, trigger the browser automation with the provided user name
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
        if (!runTaskData.id) {
            throw new Error("Failed to start automation task.");
        }

        const ptoBalance = await pollForResult(runTaskData.id, AUTOMATION_API_KEY);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ balance: ptoBalance })
        };

    } catch (error) {
        console.error("Error during automation:", error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Automation process failed.' })
        };
    }
};
