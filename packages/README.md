# packages/

Empty on purpose. Step 1 of the merge only moves the Enterprise app to its new
path; nothing is extracted yet.

Step 2 fills this directory:

    core/       db, reports, receipts, notifications, search, backup, hq client
    ui/         shared React components and pages
    editions/   capability lists -- data, not code
    platform/   electron / capacitor / browser adapters

The order and the rules are in the merge master plan.
