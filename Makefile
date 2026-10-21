up:        ## build + start all services
	docker compose up -d --build
down:
	docker compose down
logs:
	docker compose logs -f --tail=100
ps:
	docker compose ps
psql:
	docker compose exec skdr-postgres sh -c 'psql -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"'
