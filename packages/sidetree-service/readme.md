curl http://localhost:3001/did/did:elem:ropsten:EiB_4F3m_qz5tBdRmC7tcMOQJxvKSyICzQ4Uxt8cGTN5Vg

curl --header "Content-Type: application/json" --request POS
T --data '{"type":"create","suffixData":{"deltaHash":"EiCP8MJ9oX2jmTxVi6xa1WoGmzkg8HaxmW
WiR6R34cUmvw","recoveryCommitment":"EiCFei9R_74JeKbxGIZPI4XXwbb0eDpBeweA9IpymBEOFA"},"de
lta":{"updateCommitment":"EiDDJ-s9CPjkh6yaH5apLIKZ1G87K0phukB3Fofy2ujeAg","patches":[{"a
ction":"replace","document":{"publicKeys":[{"id":"signingKey","type":"EcdsaSecp256k1Veri
ficationKey2019","publicKeyJwk":{"kty":"EC","crv":"secp256k1","x":"8a7JVJUDcR_mS6gyTAgdv
GFZkhO8plwWfId3xqHa7xA","y":"xIxXstl9XR-hXXBkrhzxrFhJRvab2MLhQDus92S8G2o"},"purposes":["
authentication","assertionMethod","capabilityInvocation","capabilityDelegation","keyAgre
ement"]}],"services":[{"id":"serviceId123","type":"someType","serviceEndpoint":"https://
www.url.com"}]}}]}}' http://localhost:3001/operations