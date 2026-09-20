-- Reserved: legacy creator data is retained under the channel-first onboarding
-- requirement. Removing customer-facing routes does not authorize deleting data.
-- No DROP, DELETE, or column removal belongs in this compatibility migration.
-- If a previous version was already applied externally, restore through a
-- separately reviewed operator procedure from the existing backup.
select 1;
