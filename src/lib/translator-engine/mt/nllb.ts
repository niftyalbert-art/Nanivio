import type { IMtProvider } from './interface';
import type { MtResult } from '../types';

/** No NLLB inference service is deployed. Never relabel another provider as NLLB. */
export class NllbMtProvider implements IMtProvider {
  public id='nllb';
  public name='NLLB (not configured)';
  public canHandle(_source:string,_target:string){return false;}
  public async translate(_text:string,_source:string,_target:string):Promise<MtResult>{
    throw new Error('NLLB inference is not configured.');
  }
}
