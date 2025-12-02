const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', exception => console.log('PAGE ERROR:', exception));

  try {
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  console.log('Navigating to /leases/1...');
  await page.goto('http://localhost:3000/leases/1');
    console.log('Navigated.');
    
    // Check for heading
    const heading = await page.$('h1');
    if (heading) {
      const text = await heading.textContent();
      console.log('Heading found:', text);
    } else {
      console.log('Heading NOT found.');
      const content = await page.content();
      console.log('Page Content:', content);
    }
    
    // Check for Edit link
    const editLink = await page.$('a[href$="/edit"]');
    if (editLink) {
      console.log('Edit link found.');
    } else {
      console.log('Edit link NOT found.');
    }
  } catch (e) {
    console.error('Error:', e);
  }

  await browser.close();
})();
