import {onCall,HttpsError} from 'firebase-functions/v2/https';
import {initializeApp} from 'firebase-admin/app';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {ImageAnnotatorClient} from '@google-cloud/vision';
initializeApp();const vision=new ImageAnnotatorClient();
export const recogniseHandwriting=onCall({region:'australia-southeast1',enforceAppCheck:true,maxInstances:2,concurrency:5,timeoutSeconds:60,memory:'512MiB'},async request=>{
 if(!request.auth)throw new HttpsError('unauthenticated','Sign in first.');
 const image=request.data?.image;if(typeof image!=='string'||image.length>8000000||!/^[A-Za-z0-9+/]+={0,2}$/.test(image))throw new HttpsError('invalid-argument','Use a smaller image.');
 const ref=getFirestore().doc(`handwritingQuota/${request.auth.uid}`),day=new Date().toISOString().slice(0,10);
 await getFirestore().runTransaction(async tx=>{const snapshot=await tx.get(ref);const data=snapshot.data();const count=data?.day===day?data.count:0;if(count>=20)throw new HttpsError('resource-exhausted','Daily handwriting allowance reached.');tx.set(ref,{day,count:count+1,updatedAt:FieldValue.serverTimestamp(),expiresAt:new Date(Date.now()+48*60*60*1000)});});
 try{const [result]=await vision.documentTextDetection({image:{content:Buffer.from(image,'base64')},imageContext:{languageHints:['ja','en']}});if(result.error?.message)throw new Error(result.error.message);return {text:(result.fullTextAnnotation?.text||'').slice(0,200000)};}catch{throw new HttpsError('internal','Handwriting recognition failed. Try a clearer image.');}
});
