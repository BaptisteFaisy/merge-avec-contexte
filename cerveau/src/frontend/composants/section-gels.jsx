/**
 * Section « gels » de l'écran de réglages (item 10, MC-14).
 *
 * Calendrier des gels : ce qui est enregistré (fenêtre, branches, services,
 * récurrence, état actif / à venir / terminé) et un formulaire de création.
 * La suppression demande confirmation (item 99). Le composant ne lit ni
 * l'heure ni le stockage : la liste et les libellés viennent du modèle de vue,
 * les actions remontent au parent.
 */
import React from 'react';
import { useState } from '@forge/react';
import { Badge, Box, Button, Heading, Select, Text, TextField } from '@forge/react';
import { Confirmation } from './commun';

const GEL_VIDE = {
  nom: '',
  debut: '',
  heureDebut: '',
  fin: '',
  heureFin: '',
  branches: '',
  services: '',
  recurrence: 'none',
  jours: '',
  fuseau: 'UTC',
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEURE = /^\d{2}:\d{2}$/;

/** Le formulaire est-il complet et cohérent (fin après le début) ? */
function valide(gel) {
  if (!gel.nom.trim()) return false;
  if (!DATE.test(gel.debut) || !DATE.test(gel.fin)) return false;
  if (!HEURE.test(gel.heureDebut) || !HEURE.test(gel.heureFin)) return false;
  return `${gel.debut}T${gel.heureDebut}` < `${gel.fin}T${gel.heureFin}`;
}

/** Champ texte du formulaire de création. */
function Champ({ libelle, valeur, onChange }) {
  return (
    <Box>
      <Text>{libelle}</Text>
      <TextField value={valeur} onChange={onChange} />
    </Box>
  );
}

/** Une ligne du calendrier : nom, fenêtre, portée, récurrence, état. */
function LigneGel({ ligne, libelles, onSupprimer }) {
  return (
    <Box>
      <Text weight="bold">{ligne.nom}</Text>
      <Text>{ligne.fenetre}</Text>
      <Text>{ligne.branchesLabel}</Text>
      <Text>{ligne.servicesLabel}</Text>
      <Text>
        {ligne.recurrenceLabel} · {ligne.fuseau}
      </Text>
      <Badge>{ligne.etatLabel}</Badge>
      <Button onClick={() => onSupprimer(ligne)}>{libelles.supprimer}</Button>
    </Box>
  );
}

export default function SectionGels({ gels, libelles, locale, onCreer, onSupprimer }) {
  const [gel, setGel] = useState(GEL_VIDE);
  const [aConfirmer, setAConfirmer] = useState(null);
  const changer = (champ) => (e) => setGel((precedent) => ({ ...precedent, [champ]: e.target.value }));
  const creer = () => {
    onCreer({
      nom: gel.nom.trim(),
      debut: `${gel.debut}T${gel.heureDebut}`,
      fin: `${gel.fin}T${gel.heureFin}`,
      branches: gel.branches,
      services: gel.services,
      recurrence: gel.recurrence,
      jours: gel.jours,
      fuseau: gel.fuseau.trim() || 'UTC',
    });
    setGel(GEL_VIDE);
  };
  const options = libelles.recurrenceOptions.map((option) => ({ label: option.label, value: option.value }));
  return (
    <Box>
      <Heading>{libelles.titre}</Heading>
      <Text>{libelles.aide}</Text>
      {gels.length === 0 ? <Text>{libelles.aucun}</Text> : null}
      {gels.map((ligne) => (
        <LigneGel key={ligne.id} ligne={ligne} libelles={libelles} onSupprimer={setAConfirmer} />
      ))}
      {aConfirmer ? (
        <Confirmation
          locale={locale}
          consequence={aConfirmer.supprimerConsequence}
          onConfirmer={() => {
            onSupprimer(aConfirmer.id);
            setAConfirmer(null);
          }}
          onAnnuler={() => setAConfirmer(null)}
        />
      ) : null}
      <Champ libelle={libelles.nom} valeur={gel.nom} onChange={changer('nom')} />
      <Champ libelle={libelles.debut} valeur={gel.debut} onChange={changer('debut')} />
      <Champ libelle={libelles.heureDebut} valeur={gel.heureDebut} onChange={changer('heureDebut')} />
      <Champ libelle={libelles.fin} valeur={gel.fin} onChange={changer('fin')} />
      <Champ libelle={libelles.heureFin} valeur={gel.heureFin} onChange={changer('heureFin')} />
      <Champ libelle={libelles.branches} valeur={gel.branches} onChange={changer('branches')} />
      <Champ libelle={libelles.services} valeur={gel.services} onChange={changer('services')} />
      <Text>{libelles.recurrence}</Text>
      <Select
        options={options}
        value={options.find((option) => option.value === gel.recurrence)}
        onChange={changer('recurrence')}
      />
      {gel.recurrence === 'weekly' ? (
        <Champ libelle={libelles.jours} valeur={gel.jours} onChange={changer('jours')} />
      ) : null}
      <Champ libelle={libelles.fuseau} valeur={gel.fuseau} onChange={changer('fuseau')} />
      <Button appearance="primary" isDisabled={!valide(gel)} onClick={creer}>
        {libelles.creer}
      </Button>
    </Box>
  );
}
