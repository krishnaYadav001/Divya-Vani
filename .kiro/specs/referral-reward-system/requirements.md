# Requirements Document

## Introduction

This feature adds a referral and share-reward system to Divya Vani, the Krishna-persona chat application. The system lets an existing anonymous user invite another person to Divya Vani. When the invited (referred) person uses 3 free messages, the inviting (referrer) user is granted 120 seconds (2 minutes) of free voice talk with Krishna.

The system MUST operate entirely on the existing anonymous identity model. Divya Vani has no signup or login as its primary path: each browser receives an HTTP-only cookie (`god_messenger_uid`) holding a UUID, and one row per user is stored in the `users_memory` table keyed by `user_id`. This feature MUST NOT introduce a signup or login flow, and MUST NOT create a parallel user system; it builds on `users_memory` and the existing cookie identity.

Voice talk with Krishna is already live (the `/voice` surface, `/api/tts`, voice metering, and the voice paywall are shipped). The earned voice reward is credited to the existing one-time voice-minute wallet column `users_memory.voice_seconds_balance` (integer seconds) and is immediately usable by the Referrer, subject to the existing voice paywall entry floor of 60 combined seconds across the active subscription pool and the wallet.

Reward crediting MUST be server-side only and idempotent, mirroring the existing atomic status-guarded update plus unique-constraint idempotency pattern used by `/api/wallet/verify` and the `payments` table. The credited resource is the same `users_memory.voice_seconds_balance` wallet that `/api/wallet/verify` credits and the `consume_voice_seconds` RPC debits. Referral logic MUST NOT break or block the chat flow if it fails, consistent with the project's silent-fail-on-Supabase-error principle.

## Glossary

- **Referral_System**: The complete backend and frontend capability described in this document that generates referral codes, captures referral attribution, qualifies referrals, and credits rewards.
- **Anonymous_User**: A per-browser user identified by the `god_messenger_uid` cookie UUID, stored as one row in `users_memory` keyed by `user_id`. No signup or login is required.
- **Referrer**: An existing Anonymous_User who shares a referral link with another person.
- **Referred_User**: A new Anonymous_User who first arrives via a Referrer's referral link and is subsequently created with referral attribution.
- **Referral_Code**: A unique, stable string tied to a single Anonymous_User's `user_id`, used to attribute referrals. Embedded in a referral link as the `ref` query parameter.
- **Referral_Link**: A shareable URL of the form `https://divyavani.co.in?ref=<Referral_Code>`.
- **Pending_Referral**: A Referrals record with status `pending`, created when a Referred_User is attributed to a Referrer but has not yet met the qualification rule.
- **Qualified_Referral**: A Referrals record with status `qualified`, meaning the Referred_User has used 3 free messages and the reward has been credited.
- **Rejected_Referral**: A Referrals record with status `rejected`, meaning attribution was attempted but disallowed (for example self-referral) with a recorded reason.
- **Free_Message_Count**: The Referred_User's count of used free-tier messages, tracked by the existing `users_memory.message_count` column.
- **Qualification_Threshold**: The number of free messages a Referred_User must use to qualify a referral; the value is 3.
- **Reward_Seconds**: The voice-talk reward amount granted to a Referrer per qualified referral; the value is 120 seconds.
- **Voice_Balance**: The Referrer's balance of free voice-talk seconds, stored in the existing `users_memory.voice_seconds_balance` column (integer seconds) that the live voice feature reads, credits via `/api/wallet/verify`, and debits via the `consume_voice_seconds` RPC.
- **Reward_Transaction**: A credit/transaction record documenting a single reward grant, linked one-to-one to a Qualified_Referral.
- **Referral_Stats**: A summary returned to a Referrer including total invited, pending count, successful (qualified) count, total free voice minutes earned, and the current Referral_Link.
- **Referral_API**: The server-side API surface that performs all Referral_System reads and writes using the service-role key.
- **Share_UI**: The frontend section that presents the Referral_Link, copy/WhatsApp/native-share actions, the reward explanation, and Referral_Stats.

## Requirements

### Requirement 1: Referral code generation and stability

**User Story:** As an anonymous user, I want a unique, stable referral code tied to my existing user ID, so that I can invite others and have my invitations consistently attributed to me.

#### Acceptance Criteria

1. WHEN the Referral_API receives a request for the current Anonymous_User's Referral_Code AND no Referral_Code exists for that `user_id`, THE Referral_System SHALL generate a new Referral_Code, atomically persist it on the `users_memory` row for that `user_id`, and return it within 2 seconds.
2. WHEN the Referral_API receives a request for the current Anonymous_User's Referral_Code AND a Referral_Code already exists for that `user_id`, THE Referral_System SHALL return the existing Referral_Code without modifying it.
3. THE Referral_System SHALL enforce a database uniqueness constraint such that each Referral_Code maps to exactly one `user_id`.
4. THE Referral_System SHALL store the Referral_Code on the existing `users_memory` table and SHALL NOT create a separate user table.
5. WHEN the Referral_System generates a Referral_Code, THE Referral_System SHALL produce a value of exactly 8 characters drawn only from the URL-safe set A-Z, a-z, 0-9, hyphen, and underscore.
6. WHEN the Referral_API returns a Referral_Code, THE Referral_System SHALL return the corresponding Referral_Link in the format `https://divyavani.co.in?ref=<Referral_Code>`.
7. IF a generated Referral_Code collides with an existing Referral_Code, THEN THE Referral_System SHALL regenerate a new value up to a maximum of 5 attempts before returning an error indication.
8. IF persisting a newly generated Referral_Code to the `users_memory` row fails, THEN THE Referral_System SHALL leave the row unchanged and SHALL NOT return a Referral_Code.
9. IF no Anonymous_User identity can be resolved from the request cookie, THEN THE Referral_System SHALL NOT generate a Referral_Code and SHALL return an error indication.

### Requirement 2: Share UI

**User Story:** As an existing user, I want a share section with my invite link and easy sharing actions, so that I can invite others to Divya Vani with minimal effort.

#### Acceptance Criteria

1. WHERE the current Anonymous_User's Referral_Link is available, THE Share_UI SHALL display the Referral_Link.
2. WHILE the current Anonymous_User's Referral_Link is unavailable, THE Share_UI SHALL disable the Copy-link, WhatsApp, and native share controls.
3. THE Share_UI SHALL provide a Copy-link control that copies the Referral_Link to the clipboard.
4. WHEN the user activates the Copy-link control AND the copy succeeds, THE Share_UI SHALL display the message "Your invite link has been copied." within 1 second and SHALL keep it visible for 3 seconds.
5. IF the Copy-link clipboard operation fails, THEN THE Share_UI SHALL display an error indication and SHALL keep the Referral_Link selectable for manual copy.
6. THE Share_UI SHALL provide a WhatsApp share control that opens WhatsApp with the Referral_Link and invitation text prefilled.
7. WHERE the browser supports the Web Share API, THE Share_UI SHALL provide a native share control that invokes the Web Share API with the Referral_Link.
8. WHERE the browser does not support the Web Share API, THE Share_UI SHALL omit the native share control while retaining the Copy-link and WhatsApp controls.
9. THE Share_UI SHALL display the reward explanation with the title "Share Divya Vani" and the description "Share Divya Vani with someone who may need peace, guidance, or Krishna's wisdom. When they use 3 free messages, you receive 2 minutes of free voice talk with Krishna."
10. THE Share_UI SHALL follow the Dawn Aarti design direction described in the project design documentation and the project's frontend-design conventions.

### Requirement 3: Referral link capture

**User Story:** As a person who clicks an invite link, I want the referral attribution remembered until I start chatting, so that the person who invited me can be credited without disrupting my experience.

#### Acceptance Criteria

1. WHEN a visitor opens Divya Vani with a `ref` query parameter whose value is a valid referral code (1 to 64 characters consisting only of letters, digits, hyphens, or underscores) AND no referral code is already stored on that browser, THE Referral_System SHALL store the referral code value in browser-side persistent storage (cookie or localStorage) and SHALL retain it until the referral attribution is consumed at the visitor's first chat submission.
2. WHEN a visitor opens Divya Vani with a `ref` query parameter AND a referral code is already stored on that browser, THE Referral_System SHALL retain the existing stored referral code and SHALL NOT overwrite it.
3. IF the `ref` query parameter value is invalid (empty, contains only whitespace, exceeds 64 characters, contains characters other than letters, digits, hyphens, or underscores, or appears more than once in the query string), THEN THE Referral_System SHALL NOT store any referral code, SHALL leave any previously stored referral code unchanged, and SHALL allow normal application usage to continue.
4. WHEN a visitor opens Divya Vani with a `ref` query parameter, THE Referral_System SHALL render and allow full use of the application regardless of whether the referral code is valid or invalid, and SHALL NOT block, delay, or display a blocking error in response to referral capture.
5. WHERE backend validation of referral codes is enabled, WHEN the visitor submits their first chat message, THE Referral_System SHALL validate the stored referral code against existing Referral_Codes and SHALL discard the stored value if no matching Referral_Code exists, without blocking the chat submission.

### Requirement 4: Referral attribution on anonymous user creation

**User Story:** As a referrer, I want a referral record created when my invitee first starts chatting, so that my invitation can later be qualified for a reward.

#### Acceptance Criteria

1. WHEN the application creates a new Anonymous_User `user_id` AND a non-expired stored referral code (stored within the preceding 30 days) is present on that browser AND the stored referral code maps to an existing Referrer, THE Referral_System SHALL create a Pending_Referral record linking `referrer_user_id`, `referred_user_id`, and `referral_code` with status `pending` within 5 seconds of the `user_id` creation.
2. IF the stored referral code maps to the same `user_id` as the newly created Anonymous_User, THEN THE Referral_System SHALL NOT create a Pending_Referral and SHALL record the attempt as a Rejected_Referral with a reason indicating self-referral.
3. THE Referral_System SHALL enforce that each `referred_user_id` is associated with at most one Referrals record.
4. WHEN referral attribution is attempted for a `referred_user_id` that already has a Referrals record, THE Referral_System SHALL retain the existing Referrals record unchanged and SHALL NOT create a duplicate.
5. IF the Anonymous_User's `user_id` creation timestamp precedes the referral code storage timestamp, THEN THE Referral_System SHALL NOT create a Pending_Referral for that user.
6. IF the stored referral code does not map to any existing Referrer, THEN THE Referral_System SHALL NOT create a Pending_Referral and SHALL allow normal application usage to continue without an error indication.
7. WHEN concurrent attribution attempts occur for the same `referred_user_id`, THE Referral_System SHALL persist exactly one Referrals record for that `referred_user_id`.
8. IF persisting a Referrals record fails, THEN THE Referral_System SHALL allow the chat flow to continue without interruption and SHALL NOT leave a partial or orphaned record.

### Requirement 5: Qualification at three free messages

**User Story:** As a referrer, I want to receive my reward only after my invitee genuinely uses the product, so that rewards reflect real engagement rather than link clicks.

#### Acceptance Criteria

1. WHILE a Referred_User has a Pending_Referral, THE Referral_System SHALL track the Referred_User's Free_Message_Count (an integer between 0 and 2,147,483,647) by reading the existing `users_memory.message_count` column.
2. WHEN the chat flow increments a Referred_User's `message_count` AND the resulting Free_Message_Count reaches or exceeds exactly 3 AND the associated Referral is `pending`, THE Referral_System SHALL mark the Referral as `qualified`, record the Free_Message_Count at qualification, and set the qualification timestamp to the server UTC time.
3. WHEN the Referral_System marks a Referral as `qualified`, THE Referral_System SHALL add exactly 120 Reward_Seconds to the Referrer's Voice_Balance in the existing `users_memory.voice_seconds_balance` column and create exactly one Reward_Transaction linked to that Referral.
4. IF the Referred_User's Free_Message_Count is below the Qualification_Threshold of 3, THEN THE Referral_System SHALL leave the Referral in `pending` status and SHALL NOT credit any Reward_Seconds.
5. THE Referral_System SHALL perform qualification and reward crediting using a single status-guarded atomic operation so that, under concurrent or repeated increments, a Referral is credited at most once.
6. WHEN qualification and reward crediting occur, THE Referral_System SHALL perform the operation server-side using the service-role key.
7. THE Referral_System SHALL NOT expose any client-accessible operation that directly adds Reward_Seconds to a Voice_Balance.
8. IF qualification or reward crediting fails partway, THEN THE Referral_System SHALL roll back so that no Reward_Seconds are credited and no Reward_Transaction is recorded, SHALL preserve the Referral in `pending` status, and SHALL allow the chat flow to continue without interruption.

### Requirement 6: Database schema

**User Story:** As the project maintainer, I want the referral schema to follow the existing Supabase patterns and be delivered as manual SQL, so that it integrates cleanly with the current stack and migration process.

#### Acceptance Criteria

1. THE Referral_System SHALL add a nullable `referral_code` text column to `users_memory` with a uniqueness constraint that allows multiple NULL values but rejects duplicate non-NULL values.
2. THE Referral_System SHALL credit referral rewards to the existing `users_memory.voice_seconds_balance` column used by the live voice feature and SHALL NOT add a duplicate voice-balance field.
3. THE Referral_System SHALL use the existing `users_memory.message_count` column as the Free_Message_Count source and SHALL NOT introduce a duplicate free-message tracking field.
4. THE Referral_System SHALL define a Referrals table with a primary key `id`, columns `referrer_user_id`, `referred_user_id`, `referral_code`, `status` (NOT NULL, constrained to exactly `pending`/`qualified`/`rejected`, defaulting to `pending`), `required_messages` (NOT NULL, default 3), `reward_seconds` (NOT NULL, default 120), `referred_message_count_at_qualification`, `created_at` (NOT NULL, default current timestamp), `qualified_at`, and `rejected_reason`.
5. THE Referral_System SHALL enforce a uniqueness constraint on `referred_user_id` in the Referrals table.
6. THE Referral_System SHALL define a Reward_Transaction table with a primary key `id`, columns `user_id`, `type` (NOT NULL, default `referral_voice_reward`), `amount_seconds` (NOT NULL, default 120), `related_referral_id`, and `created_at` (NOT NULL, default current timestamp).
7. THE Referral_System SHALL enforce a uniqueness constraint on `related_referral_id` in the Reward_Transaction table.
8. THE Referral_System SHALL deliver all schema changes as idempotent manual SQL statements guarded with `IF NOT EXISTS` (or equivalent) such that re-executing the statements in the Supabase SQL Editor produces no errors and creates no duplicate columns, tables, or constraints.
9. WHEN a new Referral_System table is created, THE Referral_System SHALL enable row-level security on that table with zero policies, matching the existing `payments`/`webhook_events` convention.

### Requirement 7: Backend and API logic

**User Story:** As a frontend developer, I want server-side endpoints for all referral operations, so that the client can display referral information and the server can enforce all reward rules.

#### Acceptance Criteria

1. WHEN the Referral_API receives a request for the current Anonymous_User's referral identity, THE Referral_System SHALL return the Anonymous_User's Referral_Code and Referral_Link.
2. IF no Referral_Code exists for the current Anonymous_User when their referral identity is requested, THEN THE Referral_System SHALL generate a Referral_Code that is unique across all existing Referral_Codes before returning it.
3. WHEN the Referral_API receives a request to validate a referral code that maps to an existing Referrer, THE Referral_System SHALL report the code as valid.
4. IF the Referral_API receives a request to validate a referral code that does not map to any existing Referrer, THEN THE Referral_System SHALL report the code as invalid without creating or modifying any record.
5. WHEN the Referral_API records referral attribution for a newly created Anonymous_User `user_id` with a stored referral code present, THE Referral_System SHALL create a Pending_Referral linking the Referrer and the Referred_User.
6. IF a referral attribution request has a referrer and referred user sharing the same `user_id`, THEN THE Referral_System SHALL reject the attribution without creating a Pending_Referral.
7. WHEN referral attribution is requested for a `referred_user_id` that already has a Referrals record, THE Referral_System SHALL NOT create an additional Referrals record.
8. WHEN the chat flow increments a Referred_User's `message_count`, THE Referral_System SHALL evaluate whether the Qualification_Threshold has been reached.
9. WHEN the Qualification_Threshold is reached for a `pending` Referral, THE Referral_System SHALL mark it `qualified` and credit the Referrer at most once for that Referral.
10. WHEN the Referral_API receives a request for Referral_Stats, THE Referral_System SHALL return total invited, pending count, successful count, total free voice minutes earned, and the current Referral_Link.
11. THE Referral_System SHALL perform all referral reads and writes server-side using the service-role key.
12. IF a Referral_System operation fails, THEN THE Referral_System SHALL return the chat flow's response without surfacing the referral error and without blocking message delivery.

### Requirement 8: Anti-abuse safeguards

**User Story:** As the project maintainer, I want the referral system to resist abuse while staying privacy-safe, so that rewards are earned legitimately without invasive tracking.

#### Acceptance Criteria

1. IF a referral attribution is attempted where the Referrer and Referred_User share the same `user_id`, THEN THE Referral_System SHALL reject the attribution, SHALL NOT create a Referral record, and SHALL allow normal application usage to continue.
2. THE Referral_System SHALL associate each Referred_User with at most one Referrer.
3. WHEN a referral code is presented for a Referred_User who is already associated with a Referrer, THE Referral_System SHALL retain the existing Referrer association and SHALL ignore the newly presented code.
4. THE Referral_System SHALL credit at most one Reward_Transaction per Referral.
5. IF an Anonymous_User has sent at least one chat message before a referral code was stored in the browser cookie or localStorage, THEN THE Referral_System SHALL NOT attribute that user as a Referred_User, and SHALL allow normal application usage to continue.
6. IF a referral code does not match an existing, active Referrer `user_id` recorded in the server-side database, THEN THE Referral_System SHALL ignore the code, SHALL NOT create a Referral record, and SHALL allow normal application usage to continue.
7. WHEN qualification reward crediting is performed, THE Referral_System SHALL use a database transaction or atomic conditional update so that no more than one Reward_Transaction is recorded per Referral even under concurrent crediting attempts.
8. IF a duplicate qualification reward crediting attempt occurs for a Referral that already has a Reward_Transaction, THEN THE Referral_System SHALL reject the duplicate crediting and SHALL leave the existing Reward_Transaction unchanged.
9. THE Referral_System SHALL determine referral attribution and reward eligibility using only the existing anonymous `user_id`, browser cookie or localStorage, and server-side database checks.
10. THE Referral_System SHALL NOT use browser fingerprinting for abuse detection.
11. WHEN a referral attribution or qualification succeeds or fails, THE Referral_System SHALL write a log entry that records the outcome and the associated `user_id`, and that excludes chat message content and personal identifying information.

### Requirement 9: Frontend referral status display

**User Story:** As a referrer, I want to see my invitation progress and earned rewards, so that I understand the impact of my shares.

#### Acceptance Criteria

1. WHEN a Referrer opens the Share_UI, THE Share_UI SHALL retrieve Referral_Stats from the Referral_API and display total invited, pending count, successful count, and total free voice minutes earned.
2. WHEN the Referrer's Reward_Seconds is greater than 0, THE Share_UI SHALL display the message "You earned 2 free voice minutes because someone used Divya Vani through your invite."
3. WHEN the Share_UI presents the earned Voice_Balance in minutes, THE Share_UI SHALL compute the value as the integer division of Reward_Seconds by 60.
4. THE Share_UI SHALL retrieve all Referral_Stats values from the Referral_API and SHALL NOT compute reward values on the client.
5. IF the Referral_API request for Referral_Stats fails or does not respond within 10 seconds, THEN THE Share_UI SHALL display an error indication and SHALL NOT display partial or client-computed reward values.

### Requirement 10: Voice-reward crediting to the live voice wallet

**User Story:** As a referrer who earns voice minutes, I want my reward credited to my live voice wallet and immediately spendable, so that I can use it in a voice talk with Krishna right away.

#### Acceptance Criteria

1. WHEN Reward_Seconds are credited, THE Referral_System SHALL add the credited amount to the Referrer's existing value in the `users_memory.voice_seconds_balance` column rather than overwriting it.
2. THE Referral_System SHALL credit Reward_Seconds to the same `users_memory.voice_seconds_balance` wallet that the live voice feature reads for entry, so that the credited reward is immediately usable subject to the existing voice paywall entry floor of 60 combined seconds.
3. THE Referral_System SHALL preserve a Referrer's Voice_Balance with no expiry, decay, or time-based reset until the voice feature consumes it via the `consume_voice_seconds` RPC.
4. THE Referral_System SHALL constrain the stored `voice_seconds_balance` to an integer value between 0 and 999,999,999 seconds inclusive.
5. WHEN crediting Reward_Seconds, THE Referral_System SHALL mirror the existing atomic-credit idempotency pattern used by `/api/wallet/verify` and `payments`, applying a status-guarded atomic update together with a unique constraint so that each Referral credits the wallet at most once.
6. IF persisting a Voice_Balance credit to the `users_memory.voice_seconds_balance` column fails, THEN THE Referral_System SHALL leave the previously stored balance unchanged and return an error response indicating the credit was not applied.
