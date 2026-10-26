// Only loaded explicitly by the payment integration-test subprocess.
const originalFetch=globalThis.fetch;const transactions=new Map();
globalThis.fetch=async(url,options={})=>{
 if(!String(url).startsWith('https://api.paystack.co/'))return originalFetch(url,options);
 if(options.headers.Authorization!=='Bearer sk_test_mock')throw Error('Wrong secret');
 if(String(url).endsWith('/initialize')){const b=JSON.parse(options.body);if(b.email==='fail@example.com')return Response.json({status:false},{status:400});transactions.set(b.reference,b);return Response.json({status:true,data:{reference:b.reference,authorization_url:'https://checkout.paystack.com/test-'+b.reference}})}
 const reference=decodeURIComponent(String(url).split('/').at(-1));const b=transactions.get(reference);if(!b)return Response.json({status:false},{status:404});return Response.json({status:true,data:{id:123,reference,currency:'NGN',status:b.email==='pending@example.com'?'pending':'success',amount:b.amount+(b.email==='mismatch@example.com'?100:0),customer:{email:b.email}}});
};
