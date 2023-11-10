var OPENAI_API_KEY = ''; // Global variable to store the API key

var messages = []; // Global variable to store the chat messages
chrome.storage.sync.get('messages', function(result) {
    console.log(result);
    messages = result['messages'] || [];
});// Global variable to store the chat messages


chrome.runtime.onMessage.addListener(
    function(request, sender, sendResponse) {
        if (request.message === 'API_KEY') {
            apiKey = request.key; // Store the API key
            // console.log(apiKey);

            chatGPT("hi")
                .then(response => {
                    if (response != "error") {
                        sendResponse({status: 'success'});
                    } else {
                        console.log("error");
                        // console.log(apiKey);
                        sendResponse({status: 'error'});
                    }
                })
                .catch(error => {
                    console.log("error");
                    sendResponse({status: 'error'});
                });
        }
        return true; // keeps the sendResponse callback alive for async use
    } 
);

chrome.runtime.onMessage.addListener(async function(message, sender, sendResponse) {
    if (message.type === "API_KEY") {
        let key = message.key;
        let isValid = await checkKeyValidity(key);

        if (isValid) {
            sendResponse({status: 'is_valid'});
            OPENAI_API_KEY = key;
            console.log(`Authenticated with key ${OPENAI_API_KEY}`);
        } else {
            sendResponse({status: 'not_valid'});
        }
    } 

    else if (message.type === "PRINT") {
        console.log(`Message from frontend: ${message.message}`);
    } 

    else if (message.type === "CHAT_MESSAGE") {
        let messageContent = message.message;
        let raw_response = await chatGPT(messageContent);
        let parsed_response = await handleAssistantOutput(raw_response);
        sendResponse({response: parsed_response});
    } 

    else if (message.type === 'GET_MESSAGES') {
        sendResponse({messages: messages});
    } 

    else if (message.type === "RESET_MESSAGES") {
        chrome.storage.sync.set({"messages": []});
        messages = [];
    }

    return true; // Keep the message channel open for asynchronous response
});

async function handleAssistantOutput(raw_response) {
    const { choices: [{ finish_reason, message }] } = raw_response;

    if (finish_reason === "stop") {
        const assistant_response = message.content;
        messages.push({ "role": "assistant", "content": assistant_response });
        chrome.storage.sync.set({ 'messages': messages });
        return assistant_response;
    } 

    if (finish_reason === "function_call") {
        const { function_call: fn_call } = message;
        if (fn_call.name === 'grabScreenshotAndAsk') {
            const args = JSON.parse(fn_call.arguments);
            const vision_response = await grabScreenshotAndAsk(args.query);
            messages.push({ "role": "assistant", "content": vision_response });
            chrome.storage.sync.set({ 'messages': messages });
            return vision_response;
        } 
        return false; // Return false for unknown function call
    } 

    return false; // Return false for unknown finish reason
}

async function grabScreenshotAndAsk(query) {
    const activeTab = await chrome.tabs.query({active: true, currentWindow: true});
    const dataUrl = await chrome.tabs.captureVisibleTab(activeTab[0].windowId, {format: 'png'});
    const vision_response = await gpt4v(query, dataUrl);
    return vision_response;
}

async function checkKeyValidity(api_key) {
    const url = "https://api.openai.com/v1/chat/completions";
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${api_key}`
    };
    const data = {
        "model": "gpt-3.5-turbo",
        "messages": [{"role": "user", "content": "hi"}]
    };
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        // console.log(responseData);
        if (responseData.error) {
            return false;
        } else {
            return true;
        }
    } catch (error) {
        return false;
    }
}

async function gpt4v(query, imageUrl) {
    chrome.runtime.sendMessage({message: "THINKING", type: "function_call"});

    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
    };

    const payload = {
        "model": "gpt-4-vision-preview",
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": `${query}. Only look at the main content, ignore any toolbars or the terminal. Answer in the second person.`
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": imageUrl
                        }
                    }
                ]
            }
        ],
        "max_tokens": 1024
    };

    const response = await fetch("https://api.openai.com/v1/chat/completions", { 
        method: 'POST', 
        headers: headers, 
        body: JSON.stringify(payload) 
    });

    const data = await response.json();
    const textContent = data.choices[0].message.content;

    return textContent;
}

async function chatGPT(input, model='gpt-4-1106-preview') {
    const url = "https://api.openai.com/v1/chat/completions";
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
    };

    const functions = [
        {
            "name": "grabScreenshotAndAsk",
            "description": "Grabs a screenshot from the user's screen and uses a different AI to ask a question about it.",
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "the query to ask about the user's screen",
                    },
                },
                "required": ["query"],
            },
        },
    ];

    messages.push({"role": "user", "content": input});
    chrome.storage.sync.set({'messages': messages});

    const data = {
        "model": model,
        "messages": messages,
        "functions": functions
    };

    try {
        chrome.runtime.sendMessage({message: "THINKING", type: "normal_thinking"});
        const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(data) });
        return await response.json();
    } catch (error) {
        console.error(error);
        return false;
    }
}
