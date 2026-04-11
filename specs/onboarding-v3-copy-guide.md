# Onboarding V3 Copy Guide

## 1. Voice and Tone
- Clear, direct, and outcome-focused.
- Friendly but not playful.
- Low-ambiguity action labels.
- Never block users without a clear reason and recovery action.

## 2. Global Copy Principles
- Lead with value, then ask for input.
- Keep helper text under one sentence where possible.
- Buttons should be verb-first (`Continue`, `Analyze Website`, `Skip for now`).
- Errors must include one recovery action.
- Empty states must include why this matters and what to do next.

## 3. Flow-Level Copy
### Page Header
- Title: `Get Started`
- Subtitle: `Set up your brand context and launch your first strategy in a few minutes.`
- Optional time estimate badge: `~4 min setup`

### Step Indicator Labels
- `1. Brand Basics`
- `2. Brand Analysis`
- `3. Integrations`
- `4. Review`
- `5. Launch`

## 4. Step Copy
## Step 1: Brand Basics
### Hero
- Title: `Tell us about your brand`
- Description: `This helps Continuum tailor strategy, voice, and recommendations from day one.`

### Field Labels and Helpers
- `Brand Name`  
  Helper: `The name your team and customers recognize.`
- `Industry`  
  Helper: `Choose the closest match. You can update this later.`
- `Timezone`  
  Helper: `Used for scheduling and reporting windows.`
- `How did you hear about us?`  
  Helper: `Optional. Helps us improve onboarding.`
- `Brand Logo`  
  Helper: `Optional. PNG, JPG, or SVG under 2 MB.`

### Primary Actions
- Primary: `Continue`
- Secondary (if needed): `Save and exit`

### Validation/Error Copy
- `Brand name is required.`
- `Choose an industry to continue.`
- `Choose a timezone to continue.`
- `Logo must be under 2 MB.`
- `We couldn’t save your changes. Try again.`

## Step 2: Brand Analysis
### Hero
- Title: `Optional: analyze your website`
- Description: `Generate a first draft of your brand voice and audience in under a minute.`

### Input Area
- Label: `Website URL`
- Placeholder: `https://example.com`
- Helper: `We’ll use this to draft voice and audience recommendations.`

### Primary Actions
- Before run: `Analyze Website`
- During run: `Analyzing...`
- After success: `Use this draft`
- Secondary: `Continue without analysis`
- Tertiary: `Regenerate`

### Streaming/Loading States
- Voice card title: `Brand Voice Draft`
- Audience card title: `Target Audience Draft`
- Loading text: `Generating draft...`

### Failure and Recovery
- Inline alert title: `Analysis didn’t finish`
- Inline message: `You can retry now or continue without analysis.`
- Retry CTA: `Retry analysis`
- Continue CTA: `Continue without analysis`

### Document Upload Section
- Section title: `Knowledge Base (Optional)`
- Description: `Upload brand docs to improve strategic grounding.`
- Upload CTA: `Upload Files`
- Empty state: `No documents yet. Add PDFs, docs, or notes to improve output quality.`
- Success toast: `Document uploaded`
- Error toast: `Upload failed. Please retry.`

## Step 3: Integrations
### Hero
- Title: `Connect your channels`
- Description: `Sync ad and social accounts now, or skip and add them later.`

### Primary Actions
- Connect CTA: `Connect`
- Reconnect CTA: `Reconnect`
- Refresh CTA: `Refresh assets`
- Primary continue: `Continue`
- Secondary continue: `Skip for now`

### Selection Copy
- Group label: `Available assets`
- Count badge: `{selected} selected`
- Helper: `Select the accounts you want this brand to use.`

### Empty and Failure States
- No assets after connect: `No assets found yet. Refresh or reconnect to try again.`
- OAuth closed: `Connection window closed before completion.`
- OAuth failed: `We couldn’t complete the connection. Try again.`

## Step 4: Review
### Hero
- Title: `Review your strategy inputs`
- Description: `Confirm your brand inputs and generate a final strategic preview.`

### Summary Labels
- `Brand`
- `Connected Accounts`
- `Documents`

### Report Area
- Generate CTA: `Generate Preview`
- Regenerate CTA: `Regenerate Preview`
- Guidance placeholder: `Optional guidance to refine the output`
- Loading: `Generating strategic preview...`

### Failure and Recovery
- Error title: `Preview generation failed`
- Error body: `Retry generation or continue to launch with current inputs.`
- Retry CTA: `Retry preview`
- Continue CTA: `Continue to launch`

## Step 5: Launch
### Hero
- Title: `Ready to launch`
- Description: `We’ll save your setup and start processing your brand strategy.`

### Actions
- Primary: `Approve & Launch`
- Secondary: `Go back and review`

### Success and Failure
- Success toast: `Setup complete. Redirecting to dashboard...`
- Failure toast: `Launch failed. Your data is safe; please retry.`

## 5. Reusable UI Copy
### Generic Save/Error
- Save success: `Saved`
- Save failure: `Couldn’t save changes. Try again.`
- Network error: `Connection issue detected. Check your network and retry.`

### Unsaved Changes
- Prompt title: `Leave onboarding?`
- Prompt body: `You have unsaved progress in this step.`
- Confirm leave: `Leave`
- Stay: `Stay`

### Accessibility Labels
- Back button aria-label: `Go to previous step`
- Close dialog aria-label: `Close`
- Retry button aria-label: `Retry`

## 6. Copy QA Checklist
- Every blocking state has a non-blocking fallback when technically safe.
- Every error includes one clear recovery action.
- Button labels are action-first and unique per screen.
- Step headers match step indicator names.
- Toasts are under 90 characters where possible.
