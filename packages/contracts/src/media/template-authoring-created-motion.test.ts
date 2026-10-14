import { expect, test } from 'bun:test';
import { createdAuthoringMotionChannels } from './template-authoring-created-motion';
const node={nodeId:'draft:00000000-0000-4000-8000-000000000003',kind:'shape' as const,position:[120,140] as [number,number],scale:[110,90] as [number,number],rotation:25,opacity:70};
test('fresh authoring channels carry stable authoring identity and actual parent clock without native UID invention',()=>{
  const channels=createdAuthoringMotionChannels(node,30000/1001);
  expect(channels.map(c=>c.baseValue)).toEqual([[120,140,0],[110,90,100],25,70]);
  expect(channels.every(c=>c.channelId.startsWith(`authoring:${node.nodeId}:`) && c.frameRate===30000/1001 && c.reason===null && c.keyframes.length===0)).toBe(true);
});
test('source rigs, groups and unknown composition clocks do not gain creation capabilities',()=>{
  expect(createdAuthoringMotionChannels({...node,nodeId:'aep:1:31'},30)).toEqual([]);
  expect(createdAuthoringMotionChannels({...node,kind:'group'},30)).toEqual([]);
  expect(createdAuthoringMotionChannels(node,null)).toEqual([]);
  expect(createdAuthoringMotionChannels(node,Number.NaN)).toEqual([]);
});
