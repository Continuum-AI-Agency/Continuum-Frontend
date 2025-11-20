# Definitive Guide to Recreating the Trends Frontend

This self-contained document outlines the architecture of the existing backend and provides a clear, tranche-based plan for recreating the "Trends" feature frontend using **Radix Themes and Radix UI primitives**.

---

## Part 1: Understanding the Existing Backend Architecture

The new frontend will be built for an existing backend system composed of distinct, decoupled services. It's crucial to understand how these services interact. The process is broken into **Generation**, **Ingestion**, and **Retrieval**.

### The Service Chain: How Insights Are Made and Stored

Based on the evidence, the "backend" is not a single application. Instead, it's a chain of services where the output of one service becomes the input for the next.

**1. The Generation Service (Triggered by the Frontend)**
*   **Endpoint:** `POST /api/brand-insights/generate`
*   **Responsibility:** This is the service the frontend interacts with to start the process. Its sole job is to perform the initial, heavy-lifting task of communicating with a Large Language Model to generate a large, unstructured JSON payload containing all the raw trend, event, and audience question data.
*   **Key Action:** Upon completing its generation task, **this Generation Service acts as a client and makes an HTTP POST request to the Ingestion Service**, passing along the raw JSON it just created.

**2. The Ingestion Service (The Supabase Edge Function)**
*   **Endpoint:** `.../functions/v1/process-brand-insights-context`
*   **Responsibility:** This is a dedicated, serverless function whose only job is to receive the large JSON payload from the Generation Service. It is **not** called by the frontend.
*   **Key Actions (The Known Logic):**
    1.  **Receives Payload:** It's an HTTP-triggered function that expects the raw JSON data in the request body.
    2.  **Creates a Generation Record:** It first creates a master record in a `brand_insights_generations` table to track this specific event.
    3.  **Atomizes Data:** It iterates through every trend, event, and question in the payload.
    4.  **Generates Embeddings:** For each item, it generates a vector embedding using OpenAI's `text-embedding-3-small` model.
    5.  **Stores Individual Rows:** It inserts each item as a **separate, normalized row** into the appropriate database table (`brand_insights_trends`, `brand_insights_events`, `brand_insights_questions`), including the new embedding.
    6.  **Finalizes:** It updates the master generation record with final counts and marks it as complete.

**3. The Retrieval Service (The Frontend's Data Source)**
*   **Endpoint:** `GET /api/brand-insights/{id}`
*   **Responsibility:** This is the API the frontend calls to get the data to display. It acts as an adapter between the normalized database schema and the nested JSON structure the frontend components expect.
*   **Key Action:** When called, this service queries the individual `trends`, `events`, and `questions` tables, finds all the rows associated with the most recent completed generation for the requested account, and then **re-constructs the complex JSON object** (`BrandInsightsResponse`) before sending it to the frontend.

This decoupled architecture is a critical distinction. The frontend does not and should not know about the `process-brand-insights-context` function. It only needs to interact with the Generation and Retrieval services via the API endpoints defined in the original `brandInsightsService.ts`.

---

## Part 2: Frontend Recreation Plan (Using Radix)

This project plan is broken into four tranches, focusing exclusively on building the new frontend application.

### Tranche 1: Foundation, Styling & Core UI Shell

**Goal:** Set up the project, establish the Radix styling system, and build the static layout for the dashboard and itemized views.

1.  **Project Initialization:**
    *   Set up a new React project using Vite with the TypeScript template.
2.  **Install Core Dependencies:**
    *   Install **Radix Themes** (`@radix-ui/themes`) and **Radix UI Primitives** (e.g., `@radix-ui/react-icons`).
    *   Install `axios` for API calls and `date-fns` for date formatting.
3.  **Establish Radix Foundation:**
    *   Wrap the root of your application in the Radix `<Theme>` provider. Configure the theme (accent color, dark mode, etc.) to match your application's design system.
4.  **Copy Essential Logic:**
    *   Copy `src/types/brand-insights-types.ts` into your new project. This remains the unbreakable contract with the backend API.
    *   Copy `src/services/brandInsightsService.ts`. You will adapt its authentication logic later, but its endpoint definitions are essential.
5.  **Build Static Layouts:**
    *   Create a main `Dashboard.tsx` page component.
    *   Using Radix components (`<Grid>`, `<Flex>`, `<Card>`, `<Heading>`, `<Text>`), build the high-level layout for the dashboard. This should include placeholder areas for where trends, events, and questions will be displayed.
    *   Create a separate `ItemDetailView.tsx` component that will be used to show the "itemized understanding" of a trend or question. Build its static layout as well.

**Value Delivered:** A visually correct, statically rendered shell of the feature that adheres to the new design system.

---

### Tranche 2: Read-Only Data Display & Dashboard

**Goal:** Connect the UI to the existing backend and successfully display real, read-only data on the main dashboard.

1.  **Adapt Authentication:**
    *   Modify the `getAuthHeaders` function in your copied `brandInsightsService.ts` to correctly retrieve the authentication token from your new application's auth context.
2.  **Implement Data Fetching:**
    *   In the `Dashboard.tsx` component, implement the initial data-fetching logic. Use a `useEffect` hook to call `brandInsightsService.getInsights` and `brandInsightsService.getBrandProfile`.
    *   Manage the loading and error states. Use Radix components like `<Spinner>` or `<Callout>` to display feedback to the user.
3.  **Create Radix-based Display Components:**
    *   Re-create the `TrendCard`, `EventCard`, and `QuestionAccordion` components from the original project, but build them using Radix primitives (`<Card>`, `<Text>`, `<Accordion.Root>`).
    *   These new components will receive the data fetched in the `Dashboard.tsx` component as props.
4.  **Render Live Data:**
    *   Map over the API data and render your new Radix-based components. The goal is to see live data from your backend appearing correctly on the dashboard. At this stage, all "Generate" or "Regenerate" buttons are still disabled.

**Value Delivered:** A functional, read-only dashboard that proves successful integration with the existing backend API.

---

### Tranche 3: Itemized Views & Interactivity

**Goal:** Enable users to navigate from the dashboard to a detailed view of each insight and provide client-side filtering.

1.  **Implement Routing:**
    *   Using a router like `react-router-dom`, make each trend, event, or question on the dashboard a link to a detailed view (e.g., `/trends/{trendId}`).
2.  **Build the Detail View:**
    *   The `ItemDetailView.tsx` component should now fetch the specific data for the item ID from the URL. **Note:** This may require a new backend endpoint `GET /api/brand-insights/trends/{trendId}`. If one doesn't exist, this view can be populated by passing the data from the dashboard via router state as an initial step.
    *   Display all available fields for the item in a clean, readable format using Radix components.
3.  **Implement Client-Side Filtering:**
    *   On the dashboard, add UI controls for filtering the displayed lists.
    *   Use Radix primitives like `<DropdownMenu.Root>` for platform selection or `<TextField.Root>` for a text-based search.
    *   Use `useState` to manage the filter state and apply the filter to the data array before rendering.

**Value Delivered:** A more interactive and useful experience where users can explore the data in greater detail.

---

### Tranche 4: Full Interactivity & Generation Workflow

**Goal:** Implement the final pieces of functionality: insight generation and regeneration.

1.  **Implement Generation Logic:**
    *   In your `Dashboard.tsx`, implement the `generateInsights` function that calls the `POST /api/brand-insights/generate` endpoint.
    *   Implement the full `startPolling` logic to handle the asynchronous response, periodically checking the `GET /status/{taskId}` endpoint.
    *   Use Radix components like `<Callout>` or a custom toast notification to display feedback like "Generating insights...".
2.  **Create Generation Dialog:**
    *   Build the "Regenerate" dialog using `<Dialog.Root>` from Radix.
    *   Inside, re-implement the `SocialPlatformSelector` using Radix's `<Checkbox>` and `<Label>` components.
3.  **Wire Up All Actions:**
    *   Connect the "Generate" and "Regenerate" buttons to their respective functions.
    *   Ensure all loading (`<Spinner>`) and error (`<Callout>`) states are correctly handled across the entire application, providing a seamless user experience.
4.  **Final Polish:**
    *   Review the entire feature for accessibility and responsiveness, making adjustments to the Radix component layouts as needed.

**Value Delivered:** A complete, fully functional, and modern frontend experience for the Brand Insights feature.
