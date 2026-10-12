# Fotos novas do cardápio

As 13 imagens de produtos enviadas foram convertidas para WebP mantendo a resolução original.
O site aceita um único arquivo: `assets/fotos-tropi-2026.zip`.

Para instalar todas as fotos de uma vez, abra a pasta **assets** no GitHub, escolha **Add file > Upload files**, selecione **fotos-tropi-2026.zip**, e clique **Commit changes**. O GitHub Actions fará o build e publicará automaticamente no Firebase.

O arquivo ZIP deve conter `fotos/*.webp`. O sistema conserva as imagens anteriores se o ZIP ainda não existir e rejeita um ZIP incompleto/inválido. Logo, fidelidade e ícones permanecem intactos. O banner de combo vai dentro do pacote para eventual uso posterior.

Consulte `dist/build-info.json`: `uploadedPhotoCount=14` confirma uso de todo o pacote.
