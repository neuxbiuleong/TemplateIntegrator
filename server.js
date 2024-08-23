const express = require('express');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cors = require('cors'); // Import cors package
const moment = require('moment'); // Use moment.js to handle date formatting

const app = express();
const PORT = process.env.PORT || 3200;

app.use(cors()); // Enable CORS for all routes
app.use(express.json()); // To handle JSON payloads

function extractTemplateIds(content) {
    const regex = /const TEMPLATE_ID\s*=\s*'([^']+)'/g;
    let match;
    const ids = [];
    while ((match = regex.exec(content)) !== null) {
        ids.push(match[1]);
    }
    return ids;
}

function processFile(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf-8');
        return extractTemplateIds(content);
    } catch (err) {
        console.error(`Error reading file ${filePath}:`, err);
        return [];
    }
}

function walkDir(dir, callback) {
    fs.readdirSync(dir).forEach(file => {
        const filePath = path.join(dir, file);
        if (fs.statSync(filePath).isDirectory()) {
            walkDir(filePath, callback);
        } else if (filePath.endsWith('.ts')) {
            callback(filePath);
        }
    });
}

function collectAllTemplateIds(dir) {
    const allTemplateIds = [];

    walkDir(dir, (filePath) => {
        const templateIds = processFile(filePath);
        templateIds.forEach(templateId => allTemplateIds.push(templateId));
    });

    return allTemplateIds;
}

async function callRenderApi(templateId) {
    const url = `http://localhost:4000/render-api/${templateId}`;
    try {
        const response = await axios.post(url);
        return { templateId, success: true, data: response.data };
    } catch (error) {
        return { templateId, success: false, error: error.message };
    }
}

async function processAllTemplateIds(directoryPath) {
    const allTemplateIds = collectAllTemplateIds(directoryPath);
    const results = [];

    for (const templateId of allTemplateIds) {
        const result = await callRenderApi(templateId);
        results.push(result);
    }

    return results;
}

function addTemplatesToBlock(jsonResponse, blockId, newTemplates) {
    const defaultLanguageId = 'zh_TW';
    const defaultLanguageName = '中文';

    let language = jsonResponse.languages.find(lang => lang.language_id === defaultLanguageId);

    if (!language) {
        language = {
            language_id: defaultLanguageId,
            language_name: defaultLanguageName,
            blocks: []
        };
        jsonResponse.languages.push(language);
    }

    let block = language.blocks.find(blk => blk.block_id === blockId);

    if (!block) {
        block = {
            block_id: blockId,
            templates: []
        };
        language.blocks.push(block);
    }

    block.templates = block.templates.concat(newTemplates);
}

const getCookie = async (
    domain,
    loginUser,
    loginPwd
) => {
    try {
        // Login and get cookie
        const loginResult = await axios({
            url: `${domain}/cms-api/Login`,
            method: 'POST',
            data: {
                username: loginUser,
                password: loginPwd,
                validation_code: '',
            },
        });

        const Cookie = loginResult?.headers?.['set-cookie']?.[0] || null;

        return Cookie;
    } catch (error) {
        console.log('Failed to get Cookie:', error.message);
        return null;
    }
};

// API controller to get the Cookie
app.post('/get-cookie', async (req, res) => {
    const { domain, loginUser, loginPwd } = req.body;

    if (!domain || !loginUser || !loginPwd) {
        return res.status(400).send('domain, loginUser, and loginPwd are required.');
    }

    const cookie = await getCookie(domain, loginUser, loginPwd);

    if (cookie) {
        res.json({ cookie });
    } else {
        res.status(500).send('Failed to retrieve Cookie');
    }
});

// API controller to update content
app.put('/update-content', async (req, res) => {
    const { content_id, node_id, level, content_info_json, domain = 'http://localhost:5200', loginUser = 'admin', loginPwd = 'admin1234' } = req.body;

    if (!content_id || !node_id || level === undefined || !content_info_json) {
        return res.status(400).send('content_id, node_id, level, and content_info_json are required.');
    }

    const url = `http://localhost:5200/cms-api/Content/${content_id}?id=${content_id}`;
    const cookie = await getCookie(domain, loginUser, loginPwd);

    if (!cookie) {
        return res.status(500).send('Failed to retrieve the session cookie.');
    }

    const body = {
        common_contents: [],
        content: {
            node_id: `${node_id}`,
            content_id: `${content_id}`,
            level: level,  // Ensure level is passed as a number
            content_info: `${content_info_json}`
        }
    }

    try {
        const response = await axios.put(url, body, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Cookie': cookie,  // Set the Cookie in the request headers
            },
        });

        res.json(response.data);
    } catch (error) {
        res.status(500).send(`Error making API call: ${error.message}`);
    }
});

app.get('/extract-template-ids', async (req, res) => {
    const directoryPath = req.query.dir || path.join(__dirname, 'template_extracted');

    const allTemplateIds = collectAllTemplateIds(directoryPath);

    // Call the API for each TEMPLATE_ID
    for (const templateId of allTemplateIds) {
        await callRenderApi(templateId);
    }

    res.json(allTemplateIds);
});

app.get('/get-template-items', async (req, res) => {
    const directoryPath = req.query.dir || path.join(__dirname, 'template_extracted');

    const results = await processAllTemplateIds(directoryPath);

    const response = {
        items: results,
        total: results.length
    };

    res.json(response);
});

app.post('/get-templates-content-info-json', (req, res) => {
    let { blockId, templates } = req.body;

    if (!templates || !Array.isArray(templates)) {
        return res.status(400).send('templates must be an array and are required.');
    }

    // Set default blockId to "A" if not provided
    blockId = blockId || "A";

    const jsonResponse = {
        galleries: [],
        languages: []
    };

    // Iterate through each template and extract the templateConfig
    templates.forEach(template => {
        // if (template?.data?.templateConfig) {
        // addTemplatesToBlock(jsonResponse, blockId, [template.data.templateConfig]);
        addTemplatesToBlock(jsonResponse, blockId, [template]);

        // }
    });

    // Convert jsonResponse to a string and then parse it back into an object
    const json_content = JSON.stringify(jsonResponse);

    res.json({ json_content });
});

// New API controller to call SitemapAuditing API with nodeId using POST

// API controller to call SitemapAuditing API with nodeId using POST
app.post('/sitemap-auditing/:nodeId', async (req, res) => {
    const { nodeId } = req.params;
    const domain = 'http://localhost:5200';
    const loginUser = 'admin';
    const loginPwd = 'admin1234';

    // Construct the URL
    const url = `${domain}/cms-api/SitemapAuditing/${nodeId}?nodeId=${nodeId}`;

    // Get the current date in the required format
    const startTime = moment().format('YYYY-MM-DD HH:mm');

    // Prepare the payload
    const payload = {
        start_time: startTime,
        end_time: "9999-12-31 00:00",
        site_id: "portal",
        memo: "頁面送審"
    };

    const cookie = await getCookie(domain, loginUser, loginPwd);
    if (!cookie) {
        return res.status(500).send('Failed to retrieve the session cookie.');
    }

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            }
        });

        const { success, identity } = response.data; // Extract success and identity from the response

        if (success) {
            res.json({ orderID: identity }); // Return the identity if success is true
        } else {
            res.status(500).send('Failed to process the request. Success is false.');
        }

    } catch (error) {
        console.error(`Error calling SitemapAuditing API: ${error.message}`);
        res.status(500).send(`Error calling SitemapAuditing API: ${error.message}`);
    }
});

// New API controller to call Auditing API with orderID using POST
app.post('/auditing/:orderID', async (req, res) => {
    const { orderID } = req.params;
    const domain = 'http://localhost:5200';
    const loginUser = 'admin';
    const loginPwd = 'admin1234';

    const url = `${domain}/cms-api/Auditing/${orderID}?orderID=${orderID}`;

    // Prepare the payload
    const payload = {
        status: "APPROVED",
        comment: "審核通過"
    };

    const cookie = await getCookie(domain, loginUser, loginPwd);
    if (!cookie) {
        return res.status(500).send('Failed to retrieve the session cookie.');
    }

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            }
        });

        res.json(response.data); // Return the response data from the Auditing API

    } catch (error) {
        console.error(`Error calling Auditing API: ${error.message}`);
        res.status(500).send(`Error calling Auditing API: ${error.message}`);
    }
});

app.post('/auditing_secondary/:orderID', async (req, res) => {
    const { orderID } = req.params;
    const domain = 'http://localhost:5200';
    const loginUser = 'admin';
    const loginPwd = 'admin1234';

    const url = `${domain}/cms-api/Auditing/${orderID}?orderID=${orderID}`;

    // Prepare the payload
    const payload = {
        status: "APPROVED",
        comment: "審核通過"
    };

    const cookie = await getCookie(domain, loginUser, loginPwd);
    if (!cookie) {
        return res.status(500).send('Failed to retrieve the session cookie.');
    }

    try {
        const response = await axios.post(url, payload, {
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Content-Type': 'application/json',
                'Cookie': cookie,
            }
        });

        res.json(response.data); // Return the response data from the Auditing API

    } catch (error) {
        console.error(`Error calling Auditing API: ${error.message}`);
        res.status(500).send(`Error calling Auditing API: ${error.message}`);
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
