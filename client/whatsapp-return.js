(function(root){
 'use strict';
 // Click-to-chat cannot report message delivery. Track only leaving the site
 // and returning; the store's completion is the authority for loyalty.
 function createReturnTracker({read,write,remove,now=Date.now,maxAge=24*60*60*1000}){
  let state=read();
  function valid(){
   if(!state)return false;
   if(typeof state.uid!=='string'||typeof state.id!=='string'||!Number.isFinite(state.at)||now()-state.at>maxAge){state=null;remove();return false;}
   return true;
  }
  return {
   begin({uid,id}){state={uid,id,at:now(),left:false};write(state);},
   leave(){if(valid()){state={...state,left:true};write(state);}},
   peek(uid){return valid()&&state.left&&state.uid===uid?{...state}:null;},
   consume(uid){const value=this.peek(uid);if(value){state=null;remove();}return value;}
  };
 }
 root.TropiWhatsAppReturn=Object.freeze({createReturnTracker});
})(typeof window==='undefined'?globalThis:window);
