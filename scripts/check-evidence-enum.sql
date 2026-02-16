SELECT e.enumlabel
FROM pg_type t
JOIN pg_enum e ON t.oid = e.enumtypid
WHERE t.typname = 'EvidenceType'
ORDER BY e.enumsortorder;

