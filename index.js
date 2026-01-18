const axios = require('axios');
const sharp = require('sharp');
const fs = require('fs-extra');
const FormData = require('form-data');
const { execSync } = require('child_process');

const CONFIG = {
    fbPageId: process.env.FB_PAGE_ID,
    fbToken: process.env.FB_TOKEN,
    outscraperKey: process.env.OUTSCRAPER_KEY,
    fbPageUrl: 'https://www.facebook.com/profile.php?id=61583466142087', // Your test URL
    dataPath: './data.json'
};

async function run() {
    // 1. Fetch Reviews
    const response = await axios.get('https://api.app.outscraper.com/facebook-reviews', {
        params: { query: CONFIG.fbPageUrl, reviewsLimit: 50, async: 'false' },
        headers: { 'X-API-KEY': CONFIG.outscraperKey }
    });
    
    const goodReviews = response.data.data.filter(r => r.rating >= 4 || r.review_rating >= 4);
    const newCount = goodReviews.length;

    // 2. Check if we need to build
    const savedData = await fs.readJson(CONFIG.dataPath).catch(() => ({ count: 0 }));
    
    if (newCount > savedData.count) {
        console.log(`Building block ${newCount}...`);
        
        // 3. Generate Image
        await sharp('base_cover.png')
            .composite([{ 
                input: 'block.png', 
                top: 300 - (Math.floor(newCount/5)*40), 
                left: 100 + ((newCount%5)*60) 
            }])
            .toFile('updated_cover.png');

        // 4. Upload to Facebook
        const form = new FormData();
        form.append('source', fs.createReadStream('updated_cover.png'));
        form.append('access_token', CONFIG.fbToken);
        
        const photo = await axios.post(`https://graph.facebook.com/${CONFIG.fbPageId}/photos`, form, {
            headers: form.getHeaders()
        });

        await axios.post(`https://graph.facebook.com/${CONFIG.fbPageId}`, null, {
            params: { cover: photo.data.id, access_token: CONFIG.fbToken }
        });

        // 5. Save progress and push back to GitHub
        await fs.writeJson(CONFIG.dataPath, { count: newCount });
        execSync('git config user.name "AuraBot"');
        execSync('git config user.email "bot@aurainfotech.ca"');
        execSync('git add data.json');
        execSync('git commit -m "Update block count to ' + newCount + '"');
        execSync('git push');
        
        console.log("Mission accomplished!");
    } else {
        console.log("No new reviews found.");
    }
}

run().catch(err => console.error(err));