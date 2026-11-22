import {expect,it,vi} from 'vitest';
import {counterRepository,decodeCounter} from '../src/app/counter';
it('rejects corrupt saved state without turning it into a new installation',async()=>{
 const setItem=vi.fn(),removeItem=vi.fn();const repository=counterRepository({getItem:async()=>'{broken',setItem,removeItem});
 await expect(repository.load()).rejects.toThrow();expect(setItem).not.toHaveBeenCalled();expect(removeItem).not.toHaveBeenCalled();
 for(const value of [null,{}, {version:2,taps:0},{version:1,taps:-1},{version:1,taps:1.2}])expect(()=>decodeCounter(value)).toThrow();
});
it('writes the accepted sample state and preserves the old value on failed storage',async()=>{
 let raw:string|null=null,fail=false;const repository=counterRepository({getItem:async()=>raw,setItem:async(_key,value)=>{if(fail)throw Error('disk unavailable');raw=value;},removeItem:async()=>{raw=null;}});
 expect(await repository.load()).toEqual({version:1,taps:0});await repository.write({version:1,taps:1});fail=true;await expect(repository.write({version:1,taps:2})).rejects.toThrow();expect(await repository.load()).toEqual({version:1,taps:1});
});
