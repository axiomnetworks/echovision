/* Weak blob keys retain no displaced video. Cleared on Stop/Forget. */
export class ClipEncodingCache{
 constructor(encode){this.convert=encode;this.clear();}
 clear(){this.values=new WeakMap();}
 encode(blob){let value=this.values.get(blob);if(!value){value=Promise.resolve().then(()=>this.convert(blob));this.values.set(blob,value);value.catch(()=>{if(this.values.get(blob)===value)this.values.delete(blob);});}return value;}
}
