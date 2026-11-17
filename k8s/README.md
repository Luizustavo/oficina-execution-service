# Manifestos do Execution Service

| Arquivo | O que define |
|---|---|
| `deployment.yaml` | O serviço: 1 réplica, 192 a 384 Mi de memória, probes em `/api/execution/health` |
| `service.yaml` | Endereço interno (`ClusterIP`) |
| `ingress.yaml` | O Traefik encaminha `/api/execution` para cá |
| `hpa.yaml` | Escala de 1 a 2 réplicas por CPU e memória |
| `configmap.yaml` | Configuração sem segredo |
| `secret.example.yaml` | Modelo do Secret do serviço: JWT, RabbitMQ, New Relic |
| `mongodb.yaml` | MongoDB 8.0 do Execution (cache de 256 MB, 2 Gi de disco), só dentro do cluster, e o script que cria o `execution_user` |
| `mongodb-credentials.example.yaml` | Modelo do Secret do MongoDB: usuário root e senha do `execution_user` |

O namespace `execution` é criado pelo `oficina-infra-k8s` (`k8s/platform/namespaces.yaml`).

Os Secrets são aplicados à mão, uma vez por sessão (depois de a infra subir):

```bash
cp k8s/mongodb-credentials.example.yaml k8s/mongodb-credentials.yaml   # preencher
cp k8s/secret.example.yaml k8s/secret.yaml                             # preencher
kubectl apply -f k8s/mongodb-credentials.yaml -f k8s/secret.yaml
```

A senha do `execution_user` fica só no `mongodb-credentials.yaml` (`executionPassword`, apenas letras e números): o `deployment.yaml` lê essa chave e monta o `MONGODB_URL` do serviço com ela. O serviço não recebe a senha do root.

O CD faz o resto, nesta ordem: MongoDB (espera ficar pronto), ConfigMap, Deployment, Service, Ingress e HPA.

**MongoDB.** O `execution_user` só tem `readWrite` no `execution_db`; o root fica só no Secret do MongoDB, que o serviço não lê. O script de `/docker-entrypoint-initdb.d` roda apenas quando o volume está vazio, ou seja, no primeiro boot de cada sessão. Os índices da coleção `execution_jobs` são criados pelo próprio serviço ao subir.

```bash
kubectl exec -n execution mongodb-0 -- mongosh --quiet \
  "mongodb://execution_user:$SENHA@localhost:27017/execution_db?authSource=execution_db" \
  --eval 'db.execution_jobs.countDocuments()'
```
