import {ORPHAN_REASON_TEXT} from './orphanRelationships';
import type {useTranslations} from 'next-intl';
import type {CampaignNodeType} from '../types';
import {getSingleParentConstraintMessage} from './hierarchyRelationships';

type CanvasCopy=ReturnType<typeof useTranslations<'scale'>>;
const NODE_TYPES:readonly CampaignNodeType[]=['campaign','ad-set','ad','audience','creative','openai-campaign','openai-ad-group','openai-ad'];


/** Localizes app-owned legacy diagnostics at the display boundary; stored classification prefixes stay intact. */
export function canvasValidationMessage(message:string,translate:CanvasCopy):string{
 const compatibility=/^Ad\/Creative compatibility: ([A-Z]+) creative is not supported by ([A-Z]+) ad format\.$/.exec(message);
 if(compatibility)return translate('canvasCompatibility',{asset:compatibility[1]??'',format:compatibility[2]??''});
 if(message.startsWith('Hierarchy constraint:')){
  for(const child of NODE_TYPES)for(const parent of NODE_TYPES){
   if(message===getSingleParentConstraintMessage(child,parent))return getSingleParentConstraintMessage(child,parent,translate);
  }
 }
 for(const[kind,reason]of Object.entries(ORPHAN_REASON_TEXT))if(message===`Not connected: ${reason}, so a save would drop it.`)return translate('canvasOrphan',{kind:kind.replaceAll('-','_')});
 return translate('canvasValidationUnknown');
}
