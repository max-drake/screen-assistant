$(function() {
    // chrome.storage.sync.remove('API_KEY');

    var chatDiv = $('#chat_div');
    var chatContentDiv = $('<div>');
    var chatInputDiv = $('<div>');
    var chatInput = $('<input>');
    var chatButton = $('<button>');
    var newChatButton = $('<button>');

    chatContentDiv.attr('id', 'chat_content_div');
    chatInputDiv.attr('id', 'chat_input_div');
    chatInput.attr('id', 'chat_input');
    chatButton.attr('id', 'chat_button');
    chatButton.addClass('main_button');
    newChatButton.attr('id', 'new_chat_button');

    chatInput.attr('type', 'text');
    // chatInput.attr('placeholder', `${API_KEY_MODE}`);
    chatButton.html('Send');
    newChatButton.html('+');

    chatInput.on('keydown', function(e) {
        var key = e.which || e.keyCode;
        if (key === 13) { // 13 is the key code for Enter
            chatButton.click();
        }
    });

    chatInputDiv.append(chatInput);
    chatInputDiv.append(chatButton);
    chatInputDiv.append(newChatButton);
    chatDiv.append(chatContentDiv);
    chatDiv.append(chatInputDiv);

    chrome.storage.sync.get('API_KEY', function(data) {
        var api_key = data.API_KEY || '';
        if (api_key == '') {
            switch_mode('waiting_for_api_key');
            return;
        }
        chrome.runtime.sendMessage({type: "API_KEY", key: api_key}, function(response) {
            if (response.status == 'is_valid') {
                chrome.runtime.sendMessage({type: "PRINT", message: "api key valid"});
                chrome.storage.sync.set({'API_KEY': api_key});
                switch_mode('chat');
            } else if (response.status == 'not_valid'){
                chrome.runtime.sendMessage({type: "PRINT", message: "did not work"});
                switch_mode('api_key_invalid');
            }
        });
    });

    chrome.runtime.onMessage.addListener(
        function(request, sender, sendResponse) {
            let message = request.message;
           
            if (message == "THINKING") {
                let type = request.type;
                createThinkingMessage(type);
            } else if (message == "MESSAGES") {
                let messages = request.messages;
                if (messages.length == 0) {
                    return;
                }
                for (let i = 0; i < messages.length; i++) {
                    if (messages[i].role == "user") {
                        chatAppend(messages[i].content, "human");
                    } else if (messages[i].role == "assistant") {
                        chatAppend(messages[i].content, "assistant");
                    }
                    
                }
            }
        });

    chrome.runtime.sendMessage({type: "GET_MESSAGES"}, function(response) {
        let messages = response.messages;
        if (messages.length == 0) {
            return;
        }
        for (let i = 0; i < messages.length; i++) {
            if (messages[i].role == "user") {
                chatAppend(messages[i].content, "human");
            } else if (messages[i].role == "assistant") {
                chatAppend(messages[i].content, "assistant");
            }
            
        }
    });

    function switch_mode(mode){
        c_print(`switching to ${mode} mode`);
        if (mode == 'waiting_for_api_key') {
            $('#chat_input').attr('placeholder', 'Please paste your OpenAI API key here');
            chatInput[0].focus();
            $('#chat_button').off('click').click(function() {
                var message = $('#chat_input').val();
                if (message == '') {
                    return;
                }
                $('#chat_input').val('');
                switch_mode('checking_api_key');
                chrome.runtime.sendMessage({type: "API_KEY", key: message}, function(response) {
                    if (response.status == 'is_valid') {
                        chrome.storage.sync.set({'API_KEY': message});
                        switch_mode('chat');
                    } else if (response.status == 'not_valid'){
                        chrome.runtime.sendMessage({type: "PRINT", message: "api key invalid"});
                        switch_mode('api_key_invalid');
                    }
                });
            });
        } else if (mode == 'checking_api_key') {
            $('#chat_input').attr('placeholder', 'Checking API key');
            chatInput[0].focus();
        } else if (mode == 'api_key_invalid') {
            $('#chat_input').attr('placeholder', 'Invalid API key, please try again');
            chatInput[0].focus();
        } else if (mode == 'chat') {
            // chrome.runtime.sendMessage({type: "PRINT", message: `successfully switched to chat mode`});
            $('#chat_input').attr('placeholder', 'Write your message');
            chatInput[0].focus();
            $('#new_chat_button').click(function() {
                chrome.runtime.sendMessage({type: "RESET_MESSAGES"});
                // chrome.storage.sync.set({"messages": []});
                chatContentDiv.empty();
                chatInput[0].focus();
            });
            $('#chat_button').off('click').click(function() {
                var message = $('#chat_input').val();
                if (message == '') {
                    return;
                }
                chatAppend(message, "human");
                chrome.runtime.sendMessage({type: "CHAT_MESSAGE", message: message}, function(response) {
                    // c_print(JSON.stringify(response));
                    chatAppend(response.response, "assistant");
                });
                $('#chat_input').val('');
            });
        }
    }

    function createThinkingMessage(type) {
        if (type == "normal_thinking") {
            chatAppend("Thinking...", "assistant")
        } else if (type == "function_call") {
            chatAppend("Reading your screen...", "function_call")
        }
    }

    function chatAppend(text, sender) {
        text = text.replace(/\n/g, '<br>');
        var chat_div = $('<div>').html(text);
        
        // List of strings to check against
        var stringList = ["Thinking...", "Reading your screen..."]; // replace with your strings

        // Check the last child of chatContentDiv
        var lastChild = chatContentDiv.children().last();
        if (lastChild.length > 0 && stringList.includes(lastChild.text())) {
            lastChild.remove(); // remove the last child if its text is in the list
        }

        if (sender == "human") {
            chat_div.addClass("chat_box human");
        } else if (sender == "assistant") {
            chat_div.addClass("chat_box assistant");
        } else if (sender == "function_call") {
            chat_div.addClass("chat_box function_call");
        }
    
        chatContentDiv.append(chat_div);
        
        // Scroll the chat div into view once it's appended
        chat_div[0].scrollIntoView();
    }
    
    function c_print(text) {
        chrome.runtime.sendMessage({type: "PRINT", message: text});
    }

});



    // function createInputForm() {
    //     var apiInputDiv = document.getElementById('api_input_div');
    //     var input = document.createElement('input');
    //     var button = document.createElement('button');
    
    //     input.type = 'text';
    //     input.name = 'API_KEY';
    //     input.id = 'API_KEY';
    //     input.placeholder = 'Enter your API Key here';
    
    //     button.innerHTML = 'Submit';
    //     button.onclick = function() {
    //         chrome.storage.sync.set({ 'API_KEY': input.value });
    //         chrome.runtime.sendMessage({type: "API_KEY", key: input.value});
    //         apiInputDiv.style.display = 'none';
    //         buildUI();
    //     };
    
    //     apiInputDiv.appendChild(input);
    //     apiInputDiv.appendChild(button);
    // }

    // function buildUI() {
    //     chrome.storage.sync.get('API_KEY', function(data) {
    //         var api_key = data.API_KEY;
    //         var span = document.createElement('span');
    //         span.innerHTML = 'Your API Key is: ' + api_key;
    //         document.body.appendChild(span);
    
    //         var chatDiv = document.getElementById('chat_div');
    //         var chatContentDiv = document.createElement('div');
    //         var chatInputDiv = document.createElement('div');
    //         var chatInput = document.createElement('input');
    //         var chatButton = document.createElement('button');
    
    //         chatContentDiv.id = 'chat_content_div';
    //         chatInputDiv.id = 'chat_input_div';
    //         chatInput.id = 'chat_input';
    //         chatButton.id = 'chat_button';
    //         chatButton.className = 'main_button';
    
    //         chatInput.type = 'text';
    //         chatInput.placeholder = 'Type your message here';
    //         chatButton.innerHTML = 'Send';
    
    //         chatButton.onclick = function() {
    //             var message = chatInput.value;
    //             if (message == '') {
    //                 return;
    //             }
    //             chrome.runtime.sendMessage({type: "CHAT_MESSAGE", message: message});
    //             chatInput.value = '';
    //         };
    
    //         // Add keypress event listener to chatInput
    //         chatInput.addEventListener('keydown', function(e) {
    //             var key = e.keyCode
    //             if (key === 13) { // 13 is the key code for Enter
    //                 chatButton.click();
    //             }
    //         });
    
    //         chatInputDiv.appendChild(chatInput);
    //         chatInputDiv.appendChild(chatButton);
    //         chatDiv.appendChild(chatContentDiv);
    //         chatDiv.appendChild(chatInputDiv);
    //     });
    // }
