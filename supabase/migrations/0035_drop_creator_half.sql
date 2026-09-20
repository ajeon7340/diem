-- Reserved migration number. Creator-facing routes have been retired, but their
-- stored records and grants must survive the product transition. No data is
-- dropped here. Installations that previously applied the destructive version
-- need an operator-led restore from their existing backup; never auto-restore.
select 1;
