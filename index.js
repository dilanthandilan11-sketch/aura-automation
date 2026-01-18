const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs-extra');
const FormData = require('form-data');
const { execSync } = require('child_process');

const CONFIG = {
    fbPageId: process.env.FB_PAGE_ID,
    fbToken: process.env.FB_TOKEN,
    outscraperKey: process.env.OUTSCRAPER_KEY,
    fbPageUrl: 'https://www.facebook.com/profile.php?id=61583466142087',
    dataPath: './data.json'
};

async function run() {
    // 1. Fetch Reviews from Outscraper
    const response = await axios.get('https://api.app.outscraper.com/facebook-reviews', {
        params: { query: CONFIG.fbPageUrl, reviewsLimit: 50, async: 'false' },
        headers: { 'X-API-KEY': CONFIG.outscraperKey }
    });
    
    // Filter for 4+ star reviews
    const goodReviews = response.data.data.filter(r => (r.rating || r.review_rating) >= 4);
    const newCount = goodReviews.length;

    // 2. Load "Memory" (previous count)
    const savedData = await fs.readJson(CONFIG.dataPath).catch(() => ({ count: 0 }));
    
    if (newCount > savedData.count) {
        console.log(`New review found! Total: ${newCount}. Adding block...`);
        
        // 3. Generate the Dynamic Image
        // This math stacks blocks 5 per row, moving up 40px every row
        await sharp('base_cover.png')
            .composite([{ 
                input: 'block.png', 
                top: 300 - (Math.floor(newCount/5) * 40), 
                left: 100 + ((newCount % 5) * 60) 
            }])
            .toFile('updated_cover.png');

        // 4. Upload to Facebook Page Photos (Unpublished)
        const form = new FormData();
        form.append('source', fs.createReadStream('updated_cover.png'));
        form.append('published', 'false'); // Don't show in feed yet
        form.append('access_token', CONFIG.fbToken);
        
        const photoUpload = await axios.post(`https://graph.facebook.com/${CONFIG.fbPageId}/photos`, form, {
            headers: form.getHeaders()
        });

        // 5. Set the Uploaded Photo as the Page Cover
        await axios.post(`https://graph.facebook.com/${CONFIG.fbPageId}`, null, {
            params: { 
                cover: photoUpload.data.id, 
                access_token: CONFIG.fbToken 
            }
        });

        // 6. Save and Push back to GitHub Repository
        await fs.writeJson(CONFIG.dataPath, { count: newCount });
        
        try {
            execSync('git config user.name "AuraBot"');
            execSync('git config user.email "bot@aurainfotech.ca"');
            execSync('git add data.json');
            execSync('git commit -m "Build: Added block #' + newCount + '"');
            execSync('git push');
            console.log("Progress saved to GitHub.");
        } catch (e) {
            console.log("No changes to commit or git error.");
        }
        
        console.log("Aura InfoTech cover updated successfully!");
    } else {
        console.log("No new high-quality reviews. Building is stable.");
    }
}

run().catch(err => {
    console.error("Automation Failed:");
    console.error(err.response ? err.response.data : err.message);
});
