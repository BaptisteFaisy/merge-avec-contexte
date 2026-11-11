/**
 * Section « jumelage Bitbucket » de l'écran de réglages (écran 4, §12).
 *
 * Rend la `VueJumelage` du modèle de vue : état de la liaison, code à usage
 * unique en cours et son expiration, site jumelé, politique de repli
 * (ouvert / fermé). Les actions remontent au parent : `onGenererCode` et
 * `onRepli(politique)`.
 */
import React from 'react';
import { Box, Button, Heading, Link, Select, Text } from '@forge/react';
import { texte } from './commun';

/** Les deux politiques de repli, proposées au choix. */
function optionsRepli(locale) {
  return [
    { label: texte(locale, 'repli.open.option'), value: 'open' },
    { label: texte(locale, 'repli.closed.option'), value: 'closed' },
  ];
}

/** Le code de jumelage en cours : valeur, expiration, validité. */
function BlocCode({ jumelage, locale }) {
  if (!jumelage.codeEnCours) return null;
  return (
    <Box>
      <Text weight="bold">{texte(locale, 'reglages.codeEnCours', { code: jumelage.codeEnCours })}</Text>
      <Text>
        {jumelage.codeValide
          ? texte(locale, 'reglages.codeValide', { label: jumelage.codeExpireLabel })
          : texte(locale, 'reglages.codePerime')}
      </Text>
    </Box>
  );
}

export default function SectionJumelage({ jumelage, locale, onGenererCode, onRepli }) {
  const options = optionsRepli(locale);
  return (
    <Box>
      <Heading>{texte(locale, 'reglages.jumelage')}</Heading>
      <Text weight="bold">{jumelage.etatLabel}</Text>
      {jumelage.siteUrl ? (
        <Box>
          <Text>{texte(locale, 'reglages.site')}</Text>
          <Link href={jumelage.siteUrl}>{jumelage.siteUrl}</Link>
        </Box>
      ) : null}
      <BlocCode jumelage={jumelage} locale={locale} />
      <Button appearance="primary" onClick={onGenererCode}>
        {texte(locale, 'reglages.genererCode')}
      </Button>
      <Text>{texte(locale, 'reglages.repli')}</Text>
      <Select
        options={options}
        value={options.find((option) => option.value === jumelage.politiqueRepli)}
        onChange={(e) => onRepli(e.target.value)}
      />
    </Box>
  );
}
