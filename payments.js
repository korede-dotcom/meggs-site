import {createHmac,timingSafeEqual} from 'node:crypto';
export async function paystack(path,body,{secret=process.env.PAYSTACK_SECRET_KEY,request=fetch}={}){
 if(!secret)throw Error('Paystack is not configured. Please contact the store.');
 const response=await request('https://api.paystack.co'+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${secret}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000)});
 const result=await response.json();if(!response.ok||!result.status)throw Error('Paystack could not process this request. Please try again.');return result.data;
}
export function validSignature(raw,signature,secret=process.env.PAYSTACK_SECRET_KEY){if(!secret||typeof signature!=='string'||!/^[a-f0-9]{128}$/.test(signature))return false;const hash=createHmac('sha512',secret).update(raw).digest();return timingSafeEqual(hash,Buffer.from(signature,'hex'))}
export function matchingPayment(order,data){return data.status==='success'&&data.reference===order.paymentReference&&data.currency==='NGN'&&data.amount===order.amountKobo&&String(data.customer?.email).toLowerCase()===order.email.toLowerCase()}
