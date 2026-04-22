#Cheatsheet

## Connect db

psql -h db -p 5432 -U postgres -d nodeapi

## Show tables

\dt

## Select the wallet table

select \* from "Wallet";

## Upate the wallet table

update "Wallet" set "balance"=10 where "balance"<1;
