import type ForgeMessages from '../../../messages/forge/en.json';

/** Canonical application-owned display metadata only. Never pass source labels or authored text. */
export const FORGE_PRESENTATION_KEYS: Readonly<Record<string, keyof typeof ForgeMessages>> = {
  Text: 'presentation_71988c4d8e08',
  Removed: 'presentation_4118fb4fed0e',
  'Test render': 'presentation_a21b9c3978b0',
  Publish: 'presentation_859390eb495b',
  Retry: 'presentation_942087cc2d41',
  'Renders one watermarked frame to check each variable lands in the right place.':
    'presentation_ea3f7dd3a269',
  'Makes this template available for your brand to render.': 'presentation_f563645c3c62',
  'Runs setup again with your latest variable settings.': 'presentation_44760ed56db0',
  'Picks up from the last step that finished.': 'presentation_052d2153cb39',
  'Set up again': 'presentation_a3d39aa97f61',
  'Bring to front': 'presentation_520cdb7e4609',
  'Bring forward': 'presentation_2a3d681def30',
  'Send backward': 'presentation_f6cfe26ac4a7',
  'Send to back': 'presentation_e3daa79eaf69',
  'Sign in again to render': 'presentation_753f337c594f',
  'Your browser isn’t saving data for this site, so a reload won’t remember this send. If it doesn’t confirm, check the Render ledger before rendering again.':
    'presentation_87bbf98a0ac7',
  'Your session expired. Sign in again, then Render.': 'presentation_fb661d105cd3',
  'Your session expired. Sign in again, then Retry.': 'presentation_ba65ea01879b',
  'Your session expired. Sign in again, then Check again.': 'presentation_feb4c0ea3844',
  'You don’t have permission to render here. Ask a brand owner for access.':
    'presentation_2b72f6c1de22',
  'This set changed somewhere else. Reload it, then Check again.': 'presentation_8167d3c9a53d',
  'This set changed somewhere else. Reload it, then Render.': 'presentation_84afb295ffbd',
  'This set has an unconfirmed render. Press Render to see it, then check the Render ledger.':
    'presentation_409b8b38ffc0',
  'Meta did not answer. Try again.': 'presentation_3874d9a55d81',
  'No ad account is connected to this brand.': 'presentation_60ff04d7c626',
  'That ad account is not linked to this brand.': 'presentation_4b9c8d4747d5',
  'Composition size editing is waiting for a verified source check.': 'presentation_4ed24f34f771',
  'Composition size editing is unavailable for this source.': 'presentation_c60f64da4232',
  'Verified source geometry is unavailable.': 'presentation_d9be7b59a414',
  All: 'presentation_a52ace420f21',
  Ready: 'presentation_5fa7aac5375c',
  Drafts: 'presentation_f592e6a4db3c',
  'Needs attention': 'presentation_c1ebc7817870',
  'Shared with you': 'presentation_b447129c6d6b',
  Animated: 'presentation_d1d632796f8a',
  Static: 'presentation_1d2c73dc01f2',
  'All source types': 'presentation_8558732b0b03',
  Template: 'presentation_0575f29df888',
  Source: 'presentation_0e570ca6fabe',
  Status: 'presentation_920e413c7d41',
  Updated: 'presentation_3a5ecca188c0',
  Position: 'presentation_6d031af10da7',
  Scale: 'presentation_f102986b39ef',
  Rotation: 'presentation_57b5e2fc1bba',
  Opacity: 'presentation_6062652e10dd',
  Visibility: 'presentation_7448611d5f93',
  Font: 'presentation_64d0b3adcd2d',
  'Font size': 'presentation_6d784d95c638',
  'No change': 'presentation_41f9d57c3c4a',
  Shown: 'presentation_6ba2a0e0afd0',
  Hidden: 'presentation_7e6fefff0f0a',
  'New layer': 'presentation_66afc01a7ecc',
  Layer: 'presentation_ac9ffcb2bf47',
  'Layer order': 'presentation_101de550cf0d',
  Exposure: 'presentation_cc5454a4b7ce',
  Ops: 'presentation_ca70b5094251',
  Client: 'presentation_0c77fe09ab33',
  Alerts: 'presentation_f62e9267d196',
  DM: 'presentation_6a3aea19761a',
  'Render discovery failed': 'presentation_a1346c0f054b',
  'Slack did not answer. Try again.': 'presentation_4bce1c7a19aa',
  'Select a verified source layer to add a mask.': 'presentation_859fa0b02230',
  'Mask creation is unavailable for this layer until its writer and geometry checks pass.':
    'presentation_a46803ed6cb4',
  'A verified shape or image boundary is required.': 'presentation_bfed2dc2eb7d',
  'The expected shape boundary does not match this authored workspace layer.':
    'presentation_1190f0592ad8',
  'The measured boundary does not match a supported shape or image source.':
    'presentation_4448b658ab9e',
  'The measured boundary does not match this pinned source layer.': 'presentation_7791eed26b75',
  'The layer boundary is not verified in source pixels.': 'presentation_91ec818a6507',
  'A valid source-pixel boundary is unavailable.': 'presentation_5f34d6b754d3',
  'Enter a mask name up to 200 characters.': 'presentation_24e4ae5e646d',
  'Enter numbers for the mask boundary.': 'presentation_59715af83d0c',
  'Mask size must fit within the measured source boundary.': 'presentation_96bf9e5f816d',
  'Keep the mask boundary inside the measured source pixels.': 'presentation_6da90b80f070',
  'Opacity must be between 0 and 100 percent.': 'presentation_928db4e55b80',
  'Feather must be between 0 and 32,000 source pixels.': 'presentation_97d3def884d7',
  'Native frame rate is unavailable.': 'presentation_5bdc418119e6',
  'Native channel dimensions are unavailable.': 'presentation_95abf571a55c',
  'Separated or unverified channels are not editable.': 'presentation_47fac2424d13',
  'This vector channel does not have the verified native three-value shape.':
    'presentation_f389296e2ff2',
  'This scalar channel does not have the verified native one-value shape.':
    'presentation_a00751d56377',
  'Native Bezier speed or influence metadata is missing or invalid.': 'presentation_9d27958b0027',
  'The native keyframe value shapes do not match.': 'presentation_79fbe3d5ad55',
  'Native Position Bezier requires three-value keys and one path ease on each segment end.':
    'presentation_d570dd317e92',
  'Bezier playback is unavailable for Position segments that change Z.':
    'presentation_3a940b27d482',
  'Native Position path easing requires one valid outgoing and incoming temporal ease.':
    'presentation_1646f2ecfee6',
  'This channel has no keyframes.': 'presentation_d76f9f1c53ba',
  'The playhead time is unavailable.': 'presentation_51d50c1bd44a',
  'This keyframe segment has invalid timing.': 'presentation_e6a7a4d027d2',
  'Group timing stays locked because its parent layer does not trim child layers.':
    'presentation_000cbefa4dc7',
  'Expression-driven motion is preserved and cannot be edited here.': 'presentation_783b86259ec9',
  'Roving keyframes are preserved and cannot be edited here.': 'presentation_580b72c5bf34',
  'This motion uses spatial or automatic easing that is not editable in this timeline.':
    'presentation_e0b8ce6f5451',
  'Separated motion channels are preserved and remain locked.': 'presentation_f2338d08dc57',
  '3D motion is preserved; this timeline edits verified 2D motion only.':
    'presentation_c4e66fe144a4',
  'Native motion details are still being verified.': 'presentation_e438a13c43f7',
  'This channel is preserved and locked until its native motion can be verified.':
    'presentation_53bd1d0c8513',
  'Ops — your team, every render': 'presentation_13df6dfca8b5',
  'Client — posts only after the render passes its check': 'presentation_294295be51a5',
  'Alerts — delivery problems and approvals nobody has answered': 'presentation_8423bb506cb4',
  'Slack delivery isn’t available yet.': 'presentation_eccd9db46041',
  'That channel is gone — pick another.': 'presentation_db26b1627c41',
  'Only brand owners, admins and operators can add a Slack channel.': 'presentation_1fb04d377dc4',
  'That room is already gone. Refresh the list.': 'presentation_75ef27e3d834',
  'Slack rooms could not be read. Try again.': 'presentation_d6bf1fcd7b6c',
  'That room could not be saved. Try again.': 'presentation_6d781a209fec',
  'That Slack room is gone. Pick another.': 'presentation_586233819152',
  'Continuum hit an unexpected error talking to Slack. Try again; if it keeps failing, tell your Continuum contact.':
    'presentation_ce276837f969',
  'This brand is not connected to a render workspace yet. Ask your Continuum contact to set one up.':
    'presentation_129215480c7d',
  'Could not read this brand’s render workspace. Try again shortly.': 'presentation_f37752f1e882',
  'Rendering is not configured for this environment yet.': 'presentation_c2757bb3da1a',
  'A set with that name already exists for this template.': 'presentation_366b9759d212',
  'This template was updated after these rows were checked. Reload the template, save the set, then render again.':
    'presentation_3252ecb4165f',
  'This set was saved for another version or workspace of this template. Open it again and save it, then render.':
    'presentation_0a3a3382709b',
  'This render lost track of the set it came from. Save the set, then render again.':
    'presentation_9eebacef57d7',
  'That variable is filled by Continuum and cannot be sent.': 'presentation_f80a05f31fcc',
  'This environment has no render callback URL configured, so nothing can be prepared here yet.':
    'presentation_29ab21eacdd0',
  'That ad is no longer in the chosen campaign and ad set. Pick the ad again.':
    'presentation_54312d4bff3c',
  'That ad’s creative changed after it was picked. Pick the ad again.': 'presentation_9d9aff3b3ca0',
  'A row changed after the render set was saved. Save the set, then render again.':
    'presentation_9b249af34a71',
  'This set’s template revision changed after you opened it. Open the set again, then render.':
    'presentation_429c2b9ed92e',
  'This set is pinned to another template revision. Use “Change set template revision” to move it, then render.':
    'presentation_ab35e275b00d',
  'Some rows use formats the chosen revision does not have. Pick their formats again, then change the revision.':
    'presentation_e3ff0e0e9d9e',
  'This template’s render setup changed after the review.': 'presentation_8f7b6ef42215',
  'This review has expired. Review the rows again, then render.': 'presentation_2887b2ac3ad5',
  'This review no longer matches the rows. Review the rows again, then render.':
    'presentation_fcbb93a4865b',
  'The render service hit an unexpected error. Try again; if it keeps failing, tell your Continuum contact.':
    'presentation_280cd32ceb33',
  'This set lost track of its template and render workspace. Choose the template again, then save.':
    'presentation_af1eacfc7ca0',
  'This template has no published revision for this render workspace. Publish one from the template’s Variants tab, then save.':
    'presentation_1be3bf6ec6b0',
  'Several revisions are published to this template. Choose the revision for this set, then render.':
    'presentation_46961ed7645e',
  'That revision is not published to this render workspace. Publish it, or choose a published revision.':
    'presentation_11fcca967123',
  'That template revision no longer exists. Choose a published revision for this set.':
    'presentation_e99a0e698f77',
  'A file behind that revision was removed from the Library. Choose a published revision for this set.':
    'presentation_2a18c0336233',
  'A file behind that revision changed after it was published. Publish a new revision, then save.':
    'presentation_e2053763bfc3',
  'That variant was archived. Choose another revision for this set, or restore the variant.':
    'presentation_e64258a805bf',
  'Publish this variant revision before making it the default. Open it from the Variants tab to publish.':
    'presentation_3adc05ea742e',
  'Someone else saved this template at the same time. Reload it and save again.':
    'presentation_2fc2a0be56ed',
  'This revision renders from several After Effects files, so it cannot be edited as one file yet.':
    'presentation_5d9fef0a627b',
  'This revision renders from several After Effects files and cannot be published from just one of them. Ask your Continuum contact to publish it.':
    'presentation_79cf9b8f844e',
  'These files cannot be registered as one template revision: each output must name exactly one file.':
    'presentation_67ed45b6f95a',
  'Some colours in this template cannot be changed safely, so this revision changed none of them. Recolour those layers in After Effects, then try again.':
    'presentation_cccad3416960',
  'Template Forge needs an update before it can save a design-system revision. Ask your Continuum contact.':
    'presentation_5d0377748a5d',
};

export function presentForgeMetadata(
  source: string,
  translate: (key: keyof typeof ForgeMessages) => string,
): string {
  const key = FORGE_PRESENTATION_KEYS[source];
  return key ? translate(key) : source;
}
