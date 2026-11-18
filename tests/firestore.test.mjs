import {readFileSync} from 'node:fs';
import {test,after,before} from 'node:test';
import {initializeTestEnvironment,assertSucceeds,assertFails} from '@firebase/rules-unit-testing';
import {doc,setDoc,getDoc,deleteDoc,serverTimestamp} from 'firebase/firestore';
let env;
before(async()=>{env=await initializeTestEnvironment({projectId:'demo-kotoba',firestore:{rules:readFileSync(new URL('../firestore.rules',import.meta.url),'utf8')}});});
after(async()=>env?.cleanup());
test('Students can only access their own practice',async()=>{
 const alice=env.authenticatedContext('alice').firestore(),bob=env.authenticatedContext('bob').firestore(),guest=env.unauthenticatedContext().firestore();
 await assertSucceeds(setDoc(doc(alice,'users/alice/state/chunk-0'),{text:'日本語'}));
 await assertSucceeds(getDoc(doc(alice,'users/alice/state/chunk-0')));
 await assertFails(getDoc(doc(bob,'users/alice/state/chunk-0')));
 await assertFails(getDoc(doc(guest,'users/alice/state/chunk-0')));
 await assertFails(setDoc(doc(bob,'users/alice/state/chunk-0'),{text:'overwrite'}));
 await assertFails(deleteDoc(doc(bob,'users/alice/state/chunk-0')));
});
test('Malformed records and unexpected collections are denied',async()=>{
 const db=env.authenticatedContext('alice').firestore();
 await assertFails(setDoc(doc(db,'users/alice/state/chunk-0'),{text:'x',password:'bad'}));
 await assertFails(setDoc(doc(db,'users/alice/state/chunk-0'),{text:'x'.repeat(120001)}));
 await assertFails(setDoc(doc(db,'users/alice/state/other'),{text:'x'}));
 await assertFails(setDoc(doc(db,'public/students'),{text:'x'}));
 await assertSucceeds(setDoc(doc(db,'users/alice/state/manifest'),{schema:1,count:1,revision:1,client:'test',updatedAt:serverTimestamp()}));
 await assertFails(setDoc(doc(db,'users/alice/state/manifest'),{schema:1,count:101,revision:2,client:'test',updatedAt:serverTimestamp()}));
});
