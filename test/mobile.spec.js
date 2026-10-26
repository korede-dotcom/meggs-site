import {test,expect} from '@playwright/test';
for(const width of [320,375,390,430,768,1440])test(`homepage fits ${width}px and loads its photos`,async({page})=>{
 await page.setViewportSize({width,height:900});const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('/');await expect(page.locator('.hero-art .arch img')).toBeVisible();
 await expect.poll(()=>page.locator('.hero-art img').evaluateAll(images=>images.every(i=>i.complete&&i.naturalWidth>0))).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(await page.locator('.hero-art .arch img').getAttribute('src')).toContain('/owners/lydia-portrait.jpg');
 expect(await page.locator('.wordmark .symbol-flower').first().count()).toBe(1);
 if(width<=600){expect(await page.locator('.flower-sticker').evaluate(e=>e.getBoundingClientRect().width)).toBeLessThanOrEqual(48);await page.locator('.menu').click();await expect(page.locator('.menu')).toHaveAttribute('aria-expanded','true');await expect(page.locator('#main-navigation')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.menu')).toHaveAttribute('aria-expanded','false')}
 await page.locator('#worlds').scrollIntoViewIfNeeded();await expect(page.locator('.brand-card').first()).toHaveClass(/revealed/);expect(errors).toEqual([]);
 if(width===390)await page.screenshot({path:'test-results/mobile-home.png',fullPage:true});
});
test('reduced motion disables floating and marquee animations',async({page})=>{await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:390,height:900});await page.goto('/');await expect(page.locator('.camera-card')).toBeVisible();for(const selector of ['.camera-card','.marquee>div','.hero-copy h1'])expect(await page.locator(selector).evaluate(e=>getComputedStyle(e).animationName)).toBe('none')});
test('a missing hero photo has a working fallback',async({page})=>{await page.route('**/assets/glowwithmeggs/2.jpg',route=>route.fulfill({status:404,body:''}));await page.goto('/');await expect(page.locator('.glow-extra-card img')).toHaveAttribute('data-fallback-applied','true');await expect.poll(()=>page.locator('.glow-extra-card img').evaluate(i=>i.complete&&i.naturalWidth>0)).toBe(true)});
