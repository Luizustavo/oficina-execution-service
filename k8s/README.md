# Manifestos do Execution Service

| Arquivo | O que define |
|---|---|
| `deployment.yaml` | O serviço: 1 réplica, 192 a 384 Mi de memória, probes em `/api/execution/health` |
| `service.yaml` | Endereço interno (`ClusterIP`) |
| `ingress.yaml` | O Traefik encaminha `/api/execution` para cá |
| `hpa.yaml` | Escala de 1 a 2 réplicas por CPU e memória |
| `configmap.yaml` | Configuração sem segredo |
| `secret.example.yaml` | Modelo do Secret: JWT e New Relic |

O namespace `execution` é criado pelo `oficina-infra-k8s` (`k8s/platform/namespaces.yaml`).

O Secret é aplicado à mão, uma vez por sessão (depois de a infra subir):

```bash
cp k8s/secret.example.yaml k8s/secret.yaml   # preencher
kubectl apply -f k8s/secret.yaml
```

O CD aplica o resto: ConfigMap, Deployment, Service, Ingress e HPA.
