export async function setupOtpRoutes(page) {
  await page.route('**/api/mobile-otp', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { success: true, widgetId: 'test-widget', tokenAuth: 'public-test-token' } });
    const body = route.request().postDataJSON();
    if (body.accessToken !== 'provider-token-' + body.phone) return route.fulfill({ status: 403, json: { success: false, message: 'Mobile does not match.' } });
    return route.fulfill({ json: { success: true, proof: 'test-proof-' + body.purpose + '-' + body.phone, expiresAt: Date.now() + 600000 } });
  });
  await page.route('https://verify.msg91.com/otp-provider.js', route => route.fulfill({ contentType: 'text/javascript', body: `
    window.initSendOTP = config => {
      if (!config.exposeMethods || config.tokenAuth !== 'public-test-token') throw Error('Bad SDK configuration');
      window.getWidgetData = () => ({otpLength:6,retryTime:30});
      window.sendOtp = (phone,ok) => {window.testOtpSends=(window.testOtpSends||0)+1;setTimeout(()=>ok({type:'success',message:phone}),window.testOtpDelay||0);};
      window.retryOtp = (channel,ok,fail,reqId) => {window.testOtpRetries=(window.testOtpRetries||0)+1;ok({type:'success',message:reqId});};
      window.verifyOtp = (otp,ok,fail,reqId) => {if(otp==='012345')ok({type:'success',message:'provider-token-'+reqId});else fail({message:'Invalid OTP'});};
    };` }));
}
export async function verifyPhone(page, id) {
  const box = page.locator('#' + id + ' + .mobile-otp');
  await box.locator('[data-send]').click();
  await box.locator('.otp-digits input').first().waitFor({ state: 'visible' });
  await box.locator('.otp-digits input').first().fill('012345');
  await box.locator('[data-verify]').click();
  await box.getByText('Mobile number verified ✓').waitFor();
}
