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
            console.log(apiKey);

            chatGPT("hi")
                .then(response => {
                    if (response != "error") {
                        sendResponse({status: 'success'});
                    } else {
                        console.log("error");
                        console.log(apiKey);
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
        var key = message.key;
        // console.log(key);
        // Check if the key is valid. This will depend on your specific implementation.
        var isValid = await checkKeyValidity(key); // Assume checkKeyValidity is a function that checks the key's validity
        
        if (isValid) {
            sendResponse({status: 'is_valid'});
            OPENAI_API_KEY = key;
            console.log(`authenticated with key ${OPENAI_API_KEY}`);
        } else {
            sendResponse({status: 'not_valid'});
        }
    } else if (message.type === "PRINT") {
        console.log(`message from frontend: ${message.message}`);
    } else if (message.type === "CHAT_MESSAGE") {
        var message = message.message;
        // console.log(`sent message to GPT: ${message}`);
        var raw_response = await chatGPT(message);
        var parsed_response = await handleAssistantOutput(raw_response);
        // console.log(`response from GPT: ${response}`);
        sendResponse({response: parsed_response});
    } else if (message.type === 'GET_MESSAGES') {
        sendResponse({messages: messages});
    } else if (message.type === "RESET_MESSAGES") {
        chrome.storage.sync.set({"messages": []});
        messages = [];
    }
    // Keep the message channel open for asynchronous response
    return true;
});

async function handleAssistantOutput(raw_response) {
    console.log(raw_response);
    let finish_reason = raw_response.choices[0].finish_reason;

    if (finish_reason == "stop") {
        let assistant_response = raw_response.choices[0].message.content;
        messages.push({"role": "assistant", "content": assistant_response});
        chrome.storage.sync.set({'messages': messages});
        return assistant_response;
    } else if (finish_reason == "function_call") {
        let fn_call = raw_response.choices[0].message['function_call'];
        if (fn_call.name === 'grabScreenshotAndAsk') {
            let vision_response = await grabScreenshotAndAsk(`${fn_call.arguments.query}`);
            messages.push({"role": "assistant", "content": vision_response});
            return vision_response;
        } else {
            console.log(`unknown function call: ${fn_call.name}`);
            return false;
        }
    } else { 
        console.log(`unknown finish reason: ${finish_reason}`);
        return false;
    }
}

async function grabScreenshotAndAsk(query) {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
            chrome.tabs.captureVisibleTab(tabs[0].windowId, {format: 'png'}, async function(dataUrl) {
                let vision_response = await gpt4v(query, dataUrl);
                // console.log(dataUrl);
                return resolve(vision_response);
            });
        });
    });
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
    chrome.runtime.sendMessage({message: "THINKING", type: "function_call"})
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
    };

    let payload = {
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
                            "url": `${imageUrl}`
                        }
                    }
                ]
            }
        ],
        "max_tokens": 1024
    };

    let response = await fetch("https://api.openai.com/v1/chat/completions", { method: 'POST', headers: headers, body: JSON.stringify(payload) });
    let data = await response.json();
    console.log(data);
    let textContent = data['choices'][0]['message']['content'];

    return textContent;
}

async function chatGPT(input, model='gpt-4-1106-preview') {
    
    chrome.runtime.sendMessage({message: "THINKING", type: "normal_thinking"})

    const url = "https://api.openai.com/v1/chat/completions";
    
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
    
    const headers = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OPENAI_API_KEY}`
    };

    messages.push({"role": "user", "content": input});
    chrome.storage.sync.set({'messages': messages});

    const data = {
        "model": model,
        "messages": messages,
        "functions": functions
    };
    
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(data)
        });
        const responseData = await response.json();
        return responseData
    } catch (error) {
        return false;
    }
}

async function getFromStorage(key) {
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(key, function(result) {
            if (chrome.runtime.lastError) {
                return reject(chrome.runtime.lastError);
            }
            resolve(result);
        });
    });
}

//   function chatGPT(input) {
//     const url = "https://api.openai.com/v1/chat/completions";
//     const headers = {
//         "Content-Type": "application/json",
//         "Authorization": `Bearer ${apiKey}`
//     };
//     const data = {
//         "model": "gpt-3.5-turbo",
//         "messages": [{"role": "user", "content": input}]
//     };

//     return fetch(url, {
//         method: "POST",
//         headers: headers,
//         body: JSON.stringify(data)
//     })
//     .then(response => response.json())
//     .then(data => {
//         if (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message['content']) {
//             return data.choices[0].message['content'];
//         } else {
//             return "error";
//         }
//     })
//     .catch((error) => {
//         console.error('Error:', error);
//         return "error";
//     });
// }

// chrome.action.onClicked.addListener((tab) => {
//     chrome.tabs.captureVisibleTab(tab.windowId, { format: 'png' }).then((imageUrl) => {
//         handleImage(imageUrl);
//         // You can now do something with the image URL, like open it in a new tab
//     //   chrome.tabs.create({ url: imageUrl });
      
//     }).catch((error) => {
//       // Handle any errors
//       console.error('Error capturing the visible tab:', error);
//     });
//   });

// function handleImage(imageUrl) {
//     console.log(imageUrl);
//     console.log("hi");
//     alert(imageUrl);
// }
// const fetch = require('node-fetch');
// const fs = require('fs');
// const pngToBase64 = require('png-to-base64');

// async function encodeImage(imagePath) {
//     let bitmap = fs.readFileSync(imagePath);
//     return Buffer.from(bitmap).toString('base64');
// }

// async function encodeScreenshot() {
//     // You need to replace this part with a method to capture a screenshot in your environment
//     // For example, you can use a library like `screenshot-desktop` in a Node.js environment
//     let imagePath = "/Users/max-work/Desktop/gtp4v-testing/screen.png";
//     return await encodeImage(imagePath);
// }

// async function getScreenshotAndAsk(prompt) {
//     let base64Image = await encodeScreenshot();

//     let headers = {
//         "Content-Type": "application/json",
//         "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
//     };

//     let payload = {
//         "model": "gpt-4-vision-preview",
//         "messages": [
//             {
//                 "role": "user",
//                 "content": [
//                     {
//                         "type": "text",
//                         "text": `${prompt}. Only look at the main window, ignore any toolbars or the terminal. Answer in the second person.`
//                     },
//                     {
//                         "type": "image_url",
//                         "image_url": {
//                             "url": `data:image/jpeg;base64,${base64Image}`
//                         }
//                     }
//                 ]
//             }
//         ],
//         "max_tokens": 1024
//     };

//     let response = await fetch("https://api.openai.com/v1/chat/completions", { method: 'POST', headers: headers, body: JSON.stringify(payload) });
//     let data = await response.json();
//     let textContent = data['choices'][0]['message']['content'];

//     return textContent;
// }