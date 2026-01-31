---
feature: "Weavy.ai Clone Implementation"
spec: |
  Transform our current AI Studio node-based canvas into a comprehensive clone of Weavy.ai's Artistic Intelligence platform. Weavy focuses on scalable, professional creative workflows with granular control over AI model mixing, subject consistency, and iterative refinement. Our current canvas has basic nodes but lacks dynamic data flow, multi-model integration, workflow persistence, and advanced features like consistency controls and copilot assistance.
---

## Task List

### Feature 1: Extend Node Ecosystem
Description: Add new node types beyond current basic ones (Prompt, Negative, Model, Attachment, Generator, Preview) to support Weavy's multi-modal capabilities
- [x] 1.01 Implement LLMNode for text generation (ChatGPT, Gemini, etc.) with output handles for text (note: Completed refactoring of CreativeLibrarySidebar.tsx to use shadcn Sidebar.) (note: Split VideoGenBlock into VeoFastBlock and VideoGenBlock (Veo 3.1). Registered new node type. Verified logic.) (note: Completed LLMNode implementation via StringNode upgrade with inputs and Enrich execution) (note: Relaxed Zod URL validation across 9 files to allow bare domains like 'aws.amazon.com'. Verified with build.) (note: Plan generated. proceeding to summary.) (note: Starting work on Paid Media Refactor (Wave 1).) (note: Refactored Paid Media page with AdAccountSelector, CampaignList, and Tabbed interface. TDD verified.) (note: Starting database migration task) (note: Migration file created manually due to delegation error)
- [x] 1.02 Create VideoNode for video-specific processing and generation (note: Implementing hook) (note: Hook implemented without optimistic updates for V1 stability)
- [x] 1.03 Add ImageProcessingNode for consistency controls and transformations (note: Building UI component) (note: UI component built) (note: UI integrated into ChatSurface)
- [ ] 1.04 Implement SubjectConsistencyNode for maintaining character/object consistency across generations
- [ ] 1.05 Create WorkflowInputNode and WorkflowOutputNode for reusable flows

### Feature 2: Dynamic Data Flow Engine
Description: Implement intelligent data routing between nodes, allowing outputs to dynamically feed inputs based on node types and data compatibility
- [ ] 2.01 Design data type system (text, image, video, 3D) with validation for connections
- [ ] 2.02 Implement dynamic handle generation based on node capabilities
- [ ] 2.03 Create data transformation utilities for type conversion (e.g., image to text via OCR)
- [x] 2.04 Add connection validation and error handling for incompatible data flows (note: Audited and fixed connection validation logic for all node types, including new audio/document nodes. Fixed random string node drop bug.)

### Feature 3: Model Agnostic Architecture
Description: Enable seamless mixing of AI providers and models within the same workflow, supporting 100+ tools like Weavy
- [ ] 3.01 Expand provider schemas to include OpenAI, Anthropic, Stability AI, and more
- [ ] 3.02 Implement dynamic model selection in nodes based on input data types
- [ ] 3.03 Create unified API abstraction layer for different model providers
- [ ] 3.04 Add model benchmarking and automatic selection based on task requirements

### Feature 4: Workflow Persistence & Management
Description: Implement save/load functionality for workflows, enabling reusable production pipelines like Weavy's flows
- [ ] 4.01 Design workflow schema for serializing nodes, edges, and metadata
- [ ] 4.02 Implement save/load UI with naming and categorization
- [ ] 4.03 Add workflow gallery/library for browsing and importing templates
- [ ] 4.04 Create workflow versioning and sharing capabilities

### Feature 5: Advanced Consistency & Iteration
Description: Add Weavy's core features like subject consistency, infinite reshoots, and iterative refinement
- [ ] 5.01 Implement subject reference system for maintaining consistency across generations
- [ ] 5.02 Create infinite reshoots functionality for batch generation with variations
- [ ] 5.03 Add iterative refinement nodes for progressive improvement
- [ ] 5.04 Implement batch processing for multiple outputs from single workflow

### Feature 6: Copilot Integration
Description: Integrate AI assistance directly into the canvas for workflow suggestions and optimization
- [ ] 6.01 Create CopilotNode for AI-powered workflow suggestions
- [ ] 6.02 Implement real-time connection suggestions based on node types
- [ ] 6.03 Add workflow optimization recommendations
- [ ] 6.04 Create interactive tutorials and guidance system

### Feature 7: UI/UX Enhancements
Description: Improve the interface to match Weavy's professional, scalable design with better controls and feedback
- [ ] 7.01 Add mini-map and improved zoom/pan controls
- [ ] 7.02 Implement better node grouping and organization
- [ ] 7.03 Add visual feedback for data flow and processing states
- [ ] 7.04 Create custom node templates for common workflows

### Feature 8: Brand Insights UI Refactor
Description: Refactor the Brand Insights panel for better responsiveness, navigation, and detail expansion.
- [x] 8.01 Refactor BrandTrendsPanel to use vertical single-open accordion navigation. [pending] (note: Refactored BrandTrendsPanel to use vertical single-open accordion navigation via the new BrandTrendsAccordion component. Removed Competitors section. Verified with TDD.)
- [x] 8.02 Implement expandable rows (secondary accordion) in TrendsDataTable to show summary and momentum. [pending] (note: Implemented expandable rows (secondary accordion) in TrendsDataTable to reveal summary and momentum. Integrated sticky headers and internal scroll stabilization. Verified with TDD.)
- [x] 8.03 Apply responsive scaling and height stabilization for dashboard integration. [pending] (note: Applied responsive Tailwind 4 scaling for typography and spacing across all Brand Insights components. Stabilized container height and ensured fluid internal scrolling within the 65% dashboard slot. Updated skeletons.)

### Feature 9: Fix Role Constraints
Description: Fix mismatch between application roles ('operator') and database check constraints ('editor').
- [x] 9.01 Apply Supabase migration to update role constraints in brand_profiles.invites and brand_profiles.permissions to include 'operator' and remove 'editor'. (note: Starting database migration to update role constraints.) (note: Database constraints updated for 'invites' and 'permissions' to allow 'operator' and disallow 'editor'. Verified with test insertions.)
- [x] 9.02 Update tests/admin/admin-user-list-utils.test.ts to replace 'editor' with 'operator'. (note: Updating admin user list tests to reflect the 'operator' role.) (note: Updated tests/admin/admin-user-list-utils.test.ts and docs/PRD_DCO_Campaign_Builder.md to use 'operator' instead of 'editor'. Verified tests pass.)
