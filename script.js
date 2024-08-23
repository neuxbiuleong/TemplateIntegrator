let templateData = {}; // Object to store templateId and their corresponding templateConfig
let templatesContentResult = null; // Variable to store the result from the getTemplatesContentBtn function
let clickedOrder = []; // Array to store the order of clicked template IDs

function showLoader() {
    document.querySelector('.overlay').style.display = 'block';
    document.querySelector('.loader').style.display = 'block';
}

function hideLoader() {
    document.querySelector('.overlay').style.display = 'none';
    document.querySelector('.loader').style.display = 'none';
}

function updateTemplatesInput() {
    const checkboxes = document.querySelectorAll('#templateItemsResult input[type="checkbox"]:checked');
    const selectedConfigs = [];

    checkboxes.forEach(checkbox => {
        selectedConfigs.push(templateData[checkbox.value]);
    });

    const templatesInput = document.getElementById('templatesInput');
    templatesInput.value = JSON.stringify(selectedConfigs, null, 2);
    autoGrow(templatesInput);
}

function autoGrow(element) {
    element.style.height = "5px";
    element.style.height = (element.scrollHeight) + "px";
}

async function fetchTemplateContentInfo() {
    const templates = JSON.parse(document.getElementById('templatesInput').value);
    const blockId = "A";

    showLoader();

    try {
        const response = await fetch('http://localhost:3200/get-templates-content-info-json', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ blockId, templates: templates })
        });

        const result = await response.json();
        templatesContentResult = result.json_content; // Store the result in the variable

        // Display the content in the editable text area
        const editableContentInfo = document.getElementById('editableContentInfo');
        editableContentInfo.value = JSON.stringify(templatesContentResult, null, 2);
        autoGrow(editableContentInfo);

        editableContentInfo.addEventListener('input', function () {
            templatesContentResult = JSON.parse(editableContentInfo.value);
        });

    } catch (error) {
        console.error('Error fetching templates content info:', error);
    } finally {
        hideLoader();
    }
}

async function getCookie() {
    const domain = 'http://localhost:5200';
    const loginUser = 'admin';
    const loginPwd = 'admin1234';

    try {
        const response = await fetch('http://localhost:3200/get-cookie', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ domain, loginUser, loginPwd }),
        });

        const result = await response.json();
        if (result.cookie) {
            return result.cookie;
        } else {
            throw new Error('Failed to retrieve cookie.');
        }
    } catch (error) {
        console.error('Error fetching cookie:', error);
        return null;
    }
}

async function updateContent(content_id, node_id, level, content_info_json) {
    const url = 'http://localhost:3200/update-content';

    // Get the values from the "Get Cookie" section inputs
    const domain = document.getElementById('domain').value;
    const loginUser = document.getElementById('loginUser').value;
    const loginPwd = document.getElementById('loginPwd').value;

    const body = {
        content_id: content_id,
        node_id: node_id,
        level: level,  // Ensure level is passed as a number
        content_info_json: content_info_json,
        domain: domain,       // Use the values from the inputs
        loginUser: loginUser,  // Use the values from the inputs
        loginPwd: loginPwd     // Use the values from the inputs
    };

    try {
        const response = await axios.put(url, body, {
            headers: {
                'Content-Type': 'application/json',
            }
        });

        document.getElementById('updateContentResult').textContent = '編輯成功.';

        // Additional API call chain after successful content update
        if (response.data) {
            const sitemapUrl = `http://localhost:3200/sitemap-auditing/${node_id}`;

            try {
                const sitemapResponse = await axios.post(sitemapUrl, {
                    headers: {
                        'Content-Type': 'application/json',
                    }
                });

                document.getElementById('updateContentResult').textContent += '\n\n送審成功. OrderID received: ' + sitemapResponse.data.orderID;

                const orderID = sitemapResponse.data.orderID;
                if (orderID) {
                    const auditingUrl = `http://localhost:3200/auditing/${orderID}`;
                    try {
                        const auditingResponse = await axios.post(auditingUrl, {
                            headers: {
                                'Content-Type': 'application/json',
                            }
                        });

                        document.getElementById('updateContentResult').textContent += '\n\n審核成功 OrderID: ' + orderID;

                        try {
                            const auditingSecondaryUrl = `http://localhost:3200/auditing_secondary/${orderID}`;
                            const auditingSecondaryResponse = await axios.post(auditingSecondaryUrl, {
                                headers: {
                                    'Content-Type': 'application/json',
                                }
                            });

                            document.getElementById('updateContentResult').textContent += '\n\n放行成功 OrderID: ' + orderID;

                            // Show the link to the page after all APIs succeed
                            const linkSection = document.getElementById('linkSection');
                            const resultLink = document.getElementById('resultLink');
                            resultLink.href = `http://localhost:6200/${node_id}`;
                            resultLink.textContent = `http://localhost:6200/${node_id}`;
                            linkSection.style.display = 'block'; // Show the section

                        } catch (auditingSecondaryError) {
                            console.error('Error calling Auditing Secondary API:', auditingSecondaryError);
                            document.getElementById('updateContentResult').textContent += `\n\nError during final auditing for OrderID: ${orderID}: ${auditingSecondaryError.message}`;
                        }

                    } catch (auditingError) {
                        console.error('Error calling Auditing API:', auditingError);
                        document.getElementById('updateContentResult').textContent += `\n\nError during auditing for OrderID: ${orderID}: ${auditingError.message}`;
                    }
                } else {
                    console.error('OrderID is missing in the Sitemap Auditing response.');
                    document.getElementById('updateContentResult').textContent += '\n\nError: OrderID is missing in the Sitemap Auditing response.';
                }

            } catch (sitemapError) {
                console.error('Error calling Sitemap Auditing API:', sitemapError);
                document.getElementById('updateContentResult').textContent += `\n\nError during sitemap auditing: ${sitemapError.message}`;
            }
        }

    } catch (error) {
        console.error('Error making API call:', error);
        document.getElementById('updateContentResult').textContent = `Error during content update: ${error.message}`;
    }
}

document.getElementById('getCookieBtn').addEventListener('click', async () => {
    const domain = document.getElementById('domain').value;
    const loginUser = document.getElementById('loginUser').value;
    const loginPwd = document.getElementById('loginPwd').value;

    document.getElementById('cookieResult').textContent = 'Loading...';

    showLoader();

    try {
        const response = await fetch('http://localhost:3200/get-cookie', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain, loginUser, loginPwd })
        });

        const result = await response.json();
        document.getElementById('cookieResult').textContent = JSON.stringify(result, null, 2);
    } catch (error) {
        console.error('Error fetching cookie:', error);
        document.getElementById('cookieResult').textContent = 'Error fetching cookie.';
    } finally {
        hideLoader();
    }
});

document.getElementById('getTemplateItemsBtn').addEventListener('click', async () => {
    const dir = document.getElementById('dir').value;
    const getTemplateItemsBtn = document.getElementById('getTemplateItemsBtn');
    const templateItemsResult = document.getElementById('templateItemsResult');
    const templatesInput = document.getElementById('templatesInput'); // Get the templatesInput element
    const selectAllBtn = document.getElementById('selectAllBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');

    templatesInput.value = ''; // Clear the content of templatesInput
    templateItemsResult.innerHTML = ''; // Clear the previous template items
    templateData = {}; // Clear previous template data

    getTemplateItemsBtn.disabled = true;
    getTemplateItemsBtn.style.backgroundColor = '#6c757d';

    showLoader();

    try {
        const response = await fetch(`http://localhost:3200/get-template-items?dir=${encodeURIComponent(dir)}`, {
            method: 'GET'
        });

        const result = await response.json();

        if (result.items.length > 0) {
            result.items.forEach(item => {
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.id = item.templateId;
                checkbox.value = item.templateId;

                const label = document.createElement('label');
                label.htmlFor = item.templateId;
                label.textContent = item.templateId;

                const container = document.createElement('div');
                container.style.display = 'flex';
                container.appendChild(checkbox);
                container.appendChild(label);

                templateItemsResult.appendChild(container);

                // Store templateConfig data
                templateData[item.templateId] = item?.data?.templateConfig;

                // Add event listener for the checkbox
                checkbox.addEventListener('change', function () {
                    updateTemplatesInput();
                });
            });
            selectAllBtn.style.display = 'inline-block'; // Show "Select All" button
            clearAllBtn.style.display = 'inline-block'; // Show "Clear All" button
        } else {
            selectAllBtn.style.display = 'none'; // Hide "Select All" button
            clearAllBtn.style.display = 'none'; // Hide "Clear All" button
        }

    } catch (error) {
        console.error('Error fetching template items:', error);
        const errorMessage = document.createElement('div');
        errorMessage.textContent = 'Error fetching template items.';
        templateItemsResult.appendChild(errorMessage);
        selectAllBtn.style.display = 'none'; // Hide "Select All" button
        clearAllBtn.style.display = 'none'; // Hide "Clear All" button
    } finally {
        getTemplateItemsBtn.disabled = false;
        getTemplateItemsBtn.style.backgroundColor = '#28a745';
        hideLoader();
    }
});

document.getElementById('selectAllBtn').addEventListener('click', function () {
    const checkboxes = document.querySelectorAll('#templateItemsResult input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = true;
    });
    updateTemplatesInput();
});


document.getElementById('clearAllBtn').addEventListener('click', function () {
    const checkboxes = document.querySelectorAll('#templateItemsResult input[type="checkbox"]');
    checkboxes.forEach(checkbox => {
        checkbox.checked = false;
    });
    updateTemplatesInput();
});

// Add event listeners to checkboxes in templateItemsResult
document.getElementById('templateItemsResult').addEventListener('change', async (event) => {
    const checkbox = event.target;
    const templateId = checkbox.value;

    // Update clicked order
    if (checkbox.checked) {
        clickedOrder.push(templateId); // Add to the end of the order array
    } else {
        clickedOrder = clickedOrder.filter(id => id !== templateId); // Remove if unchecked
    }

    // Reorder templates based on the clicked order
    const reorderedConfigs = clickedOrder.map(id => templateData[id]);

    // Update templatesInput with reordered configurations
    const templatesInput = document.getElementById('templatesInput');
    templatesInput.value = JSON.stringify(reorderedConfigs, null, 2);
    autoGrow(templatesInput);

    // Fetch template content info based on the new order
    await fetchTemplateContentInfo();
});

document.getElementById('triggerContentInfoJsonBtn').addEventListener('click', async () => {
    const content_id = document.getElementById('contentIdInput').value;
    const node_id = document.getElementById('nodeIdInput').value;
    const level = parseInt(document.getElementById('levelInput').value, 10);
    const content_info_json = templatesContentResult; // Use the stored result directly
    const triggerContentInfoJsonBtn = document.getElementById('triggerContentInfoJsonBtn');

    if (content_id && node_id && !isNaN(level) && content_info_json) {
        triggerContentInfoJsonBtn.disabled = true; // Disable the button
        triggerContentInfoJsonBtn.style.backgroundColor = '#6c757d'; // Change the button color to indicate it's disabled
        showLoader(); // Show the loader

        // Hide the link section before starting the process
        const linkSection = document.getElementById('linkSection');
        linkSection.style.display = 'none';

        try {
            await updateContent(content_id, node_id, level, content_info_json);
        } catch (error) {
            console.error('Error updating content:', error);
        } finally {
            triggerContentInfoJsonBtn.disabled = false; // Re-enable the button
            triggerContentInfoJsonBtn.style.backgroundColor = '#28a745'; // Reset the button color
            hideLoader(); // Hide the loader
        }
    } else {
        alert('Please provide valid inputs for content_id, node_id, level, and ensure templates content is loaded.');
    }
});
