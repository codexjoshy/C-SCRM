import { getQuestionResponse, getCellMultiples } from "./general-utils";

// store here as constant for now, may want to put in data
const NORMALIZED_VALUES = {
  suppliers_access: 100,
  suppliers_assurance: 100,
  products_access: 100,
  products_dependency: 100,
  products_criticality: 100,
  projects_criticality: 100,
  assets_criticality: 100
};

// weighting for final scoring
export const DEPENDENCY_WEIGHT = 0.25;
export const ASSET_WEIGHTS = {
  PA: 0.25,
  SDA: 0.25,
  ICTA: 0.25
};

export const MAX_IMPACT_SCORE =
  (DEPENDENCY_WEIGHT +
    Object.values(ASSET_WEIGHTS).reduce((acc, w) => acc + w, 0)) *
  100.0;

export function calculateItemRisk(
  resourceType,
  responses,
  questions,
  resources
) {
  const handleQuestionResponse = (
    itemRisk,
    itemResponses,
    question,
    qid,
    qtype,
    ckey = null
  ) => {
    if (itemResponses.hasOwnProperty(qid)) {
      const ansInd = Math.max(
        parseInt(getQuestionResponse(itemResponses[qid])),
        0
      );
      if (ckey != null) {
        itemRisk[qtype][ckey] =
          (itemRisk[qtype][ckey] || 0) +
          question.Answers[ansInd].val * (question.Weight || 1);
      } else {
        itemRisk[qtype] =
          (itemRisk[qtype] || 0) +
          question.Answers[ansInd].val * (question.Weight || 1);
      }
    } else if (ckey != null) {
      itemRisk[qtype][ckey] =
        (itemRisk[qtype][ckey] || 0) +
        Math.max.apply(
          Math,
          question.Answers.map(ans => {
            return ans.val;
          })
        ) *
          (question.Weight || 1);
    } else {
      itemRisk[qtype] =
        (itemRisk[qtype] || 0) +
        Math.max.apply(
          Math,
          question.Answers.map(ans => {
            return ans.val;
          })
        ) *
          (question.Weight || 1);
    }
  };

  let perItemRisk = {};
  const resourcesMap = {};
  resources.forEach(r => (resourcesMap[r.ID] = r));

  // For each item (supplier, product, project) with responses
  Object.entries(responses).forEach(responseEntry => {
    let itemId = responseEntry[0];
    let itemResponses = responseEntry[1];

    // score, criticality is dictionary keyed by related resource type & id
    perItemRisk[itemId] = {
      Access: {},
      Criticality: {},
      Dependency: {},
      Assurance: 0
    };

    questions.forEach(question => {
      const qtype = question["Type of question"];
      const qkey = question.Relation;
      if (qtype === "Access") {
        // access applies to specific organization assets
        // both products and suppliers can have access
        const assetIdVal = question["Asset ID"];
        const assetIds = getCellMultiples(assetIdVal);
        assetIds.forEach(aid => {
          const ckey = `asset|${aid}`; // for key need type and id, concatenate
          const qid = `${question.ID}|${aid}`; // key into responses
          handleQuestionResponse(
            perItemRisk[itemId],
            itemResponses,
            question,
            qid,
            "Access",
            ckey
          );
        });
      } else if (qtype === "Criticality") {
        // responses for each related project
        // products can have criticality questions, and projects
        // have criticality to their parent (organization), as do assets
        const key = resourceType === "products" ? "Project ID" : "Parent ID";
        const projectIds = getCellMultiples(
          (resourcesMap[itemId] || {})[key] || ""
        );
        projectIds.forEach(pid => {
          const ckey = `project|${pid}`; // for key need type and id, concatenate
          const qid = qkey ? `${question.ID}|${pid}` : question.ID; // key into responses
          handleQuestionResponse(
            perItemRisk[itemId],
            itemResponses,
            question,
            qid,
            qtype,
            ckey
          );
        });
      } else if (qtype === "Dependency") {
        // responses for each related supplier
        // only applies to products
        const supplierIds = getCellMultiples(
          (resourcesMap[itemId] || {})["Supplier ID"] || ""
        );
        supplierIds.forEach(sid => {
          const ckey = `supplier|${sid}`; // for key need type and id, concatenate
          const qid = qkey ? `${question.ID}|${sid}` : question.ID; // key into responses
          handleQuestionResponse(
            perItemRisk[itemId],
            itemResponses,
            question,
            qid,
            qtype,
            ckey
          );
        });
      } else if (qtype === "Assurance") {
        // only applies to suppliers
        handleQuestionResponse(
          perItemRisk[itemId],
          itemResponses,
          question,
          question.ID,
          qtype
        );
      }
    });

    // normalize assurance
    // invert it so that low scores are bad (no mitigations)
    const nval = NORMALIZED_VALUES[`${resourceType}_assurance`];
    perItemRisk[itemId].Assurance =
      nval -
      (perItemRisk[itemId].Assurance / getMaxScore(questions, "Assurance")) *
        nval;

    // normalize access
    Object.keys(perItemRisk[itemId].Access || {}).forEach(qkey => {
      const assetId = qkey.split("|")[1];
      const nval = NORMALIZED_VALUES[`${resourceType}_access`];
      const maxAccess = getMaxAccessScore(questions, assetId);
      perItemRisk[itemId].Access[qkey] =
        (perItemRisk[itemId].Access[qkey] / maxAccess) * nval;
    });

    // normalize criticalities
    const maxCriticality = getMaxScore(questions, "Criticality");
    Object.keys(perItemRisk[itemId].Criticality || {}).forEach(qkey => {
      const nval = NORMALIZED_VALUES[`${resourceType}_criticality`];
      perItemRisk[itemId].Criticality[qkey] =
        (perItemRisk[itemId].Criticality[qkey] / maxCriticality) * nval;
    });

    // normalize dependencies
    const maxDependency = getMaxScore(questions, "Dependency");
    Object.keys(perItemRisk[itemId].Dependency || {}).forEach(qkey => {
      const nval = NORMALIZED_VALUES[`${resourceType}_dependency`];
      perItemRisk[itemId].Dependency[qkey] =
        (perItemRisk[itemId].Dependency[qkey] / maxDependency) * nval;
    });
  });
  // console.log("per item risk: ", perItemRisk);
  return perItemRisk;
}

export function computeImpacts(
  projectRisks,
  productRisks,
  supplierRisks,
  assetRisks,
  projects,
  products,
  suppliers,
  assets
) {
  const projectsMap = {};
  const productsMap = {};
  const suppliersMap = {};
  projects.forEach(p => (projectsMap[p.ID] = p));
  products.forEach(p => (productsMap[p.ID] = p));
  suppliers.forEach(s => (suppliersMap[s.ID] = s));

  let dependencyScoreEntries = [];
  let accessScoreEntries = [];
  const scores = {
    project: {},
    product: {},
    supplier: {}
  };
  projects.forEach(
    p =>
      (scores.project[p.ID] = {
        dependency: [],
        supplyLines: [],
        impact: 0,
        interdependence: 0
      })
  );
  products.forEach(
    p =>
      (scores.product[p.ID] = {
        dependency: [],
        access: [],
        supplyLines: [],
        impact: 0,
        interdependence: 0
      })
  );
  suppliers.forEach(
    s =>
      (scores.supplier[s.ID] = {
        dependency: [],
        access: [],
        supplyLines: [],
        impact: 0,
        interdependence: 0,
        assurance: (supplierRisks[s.ID] || {}).Assurance || 0
      })
  );
  const productSupplierAccessScores = {};
  products.forEach(p => {
    suppliers.forEach(
      s => (productSupplierAccessScores[`${p.ID}|${s.ID}`] = [])
    );
  });

  Object.entries(productRisks).forEach(entry => {
    const [productId, scores] = entry;
    Object.entries(scores.Dependency || {}).forEach(dpentry => {
      const [skey, dpscore] = dpentry;
      const supplierId = skey.split("|")[1];
      const supplier = supplierRisks[supplierId] || {};
      // const assurance = supplier.Assurance || 0;
      Object.entries(scores.Criticality || {}).forEach(crentry => {
        const [pkey, crscore] = crentry;
        const projectId = pkey.split("|")[1];
        const project = projectRisks[projectId] || {};
        const prcrit =
          (Object.entries(project.Criticality || {})[0] || [])[1] || 0;
        // const adscore = (assurance * dpscore * crscore * prcrit) / 1000.0;
        const dscore = (dpscore * crscore * prcrit) / 10000.0;
        let adscoreEntry = {
          projectId,
          productId,
          supplierId,
          dependencyScore: dscore
        };
        dependencyScoreEntries.push(adscoreEntry);
      });
      Object.entries(assetRisks).forEach(asentry => {
        const [assetId, assetScores] = asentry;
        const crit =
          (Object.entries(assetScores.Criticality || {})[0] || [])[1] || 0;
        let score = 0;
        let normalizeFactor = 0;
        Object.entries(scores.Access).forEach(acentry => {
          const [akey, acscore] = acentry;
          const curAssetId = akey.split("|")[1];
          if (curAssetId === assetId) {
            score += acscore;
            normalizeFactor += 100;
          }
        });
        Object.entries(supplier.Access || {}).forEach(acentry => {
          const [akey, acscore] = acentry;
          const curAssetId = akey.split("|")[1];
          if (curAssetId === assetId) {
            score += acscore;
            normalizeFactor += 100;
          }
        });
        if (normalizeFactor > 1) {
          score = normalizeFactor > 0 ? crit * (score / normalizeFactor) : 0;
          let accessScoreEntry = { assetId, productId, supplierId, score };
          accessScoreEntries.push(accessScoreEntry);
        }
      });
    });
  });
  dependencyScoreEntries.forEach(entry => {
    ((scores.project[entry.projectId] || {}).dependency || []).push(entry);
    scores.product[entry.productId].dependency.push(entry);
    ((scores.supplier[entry.supplierId] || {}).dependency || []).push(entry);
  });

  accessScoreEntries.forEach(entry => {
    scores.product[entry.productId].access.push(entry);
    ((scores.supplier[entry.supplierId] || {}).access || []).push(entry);
    (
      productSupplierAccessScores[`${entry.productId}|${entry.supplierId}`] ||
      []
    ).push(entry);
  });

  // can compute supply line scores now
  const supplyLineScores = dependencyScoreEntries.map(entry => {
    const accessKey = `${entry.productId}|${entry.supplierId}`;
    const accessScores = productSupplierAccessScores[accessKey] || [];
    const score =
      entry.dependencyScore * DEPENDENCY_WEIGHT +
      accessScores.reduce(
        (acc, val) => acc + val.score * (ASSET_WEIGHTS[val.assetId] || 0),
        0
      );
    const supplyLineAccessScores = accessScores.reduce((acc, as) => {
      acc[as.assetId] = as.score;
      return acc;
    }, {});
    let rv = { ...entry, score, accessScores: supplyLineAccessScores };
    return rv;
  });

  supplyLineScores.forEach(entry => {
    ((scores.project[entry.projectId] || {}).supplyLines || []).push(entry);
    scores.product[entry.productId].supplyLines.push(entry);
    ((scores.supplier[entry.supplierId] || {}).supplyLines || []).push(entry);
  });

  // find top-level org "project"
  const orgs = projects.filter(p => !p.parent);
  orgs.forEach(org => (scores.project[org.ID].supplyLines = supplyLineScores));

  Object.values(scores).forEach(resourceInfo =>
    Object.values(resourceInfo).forEach(info => {
      info.impact = computeImpactFromSupplyLines(info.supplyLines);
      // keyed by resource id
      info.interdependence = info.supplyLines
        .map(sl => sl.score)
        .reduce((acc, val) => acc + val, 0);
      if (info.assurance === undefined) {
        const uniqueSuppliers = info.supplyLines.reduce(
          (acc, sl) => acc.add(sl.supplierId),
          new Set()
        );
        const assurances = Array.from(uniqueSuppliers).map(
          sid => (supplierRisks[sid] || {}).Assurance || 0
        );
        info.assurance =
          assurances.length > 0
            ? assurances.reduce((acc, val) => acc + val, 0) / assurances.length
            : 0;
      }
    })
  );

  // console.log("SCORES", scores);
  return scores;
}

export function computeImpactFromSupplyLines(supplyLines) {
  // find max dependency score
  const dependencyScore =
    Math.max(...supplyLines.map(sl => sl.dependencyScore), 0) *
    DEPENDENCY_WEIGHT;
  // find each asset max score
  const accessScores = Object.entries(ASSET_WEIGHTS).map(entry => {
    const [assetId, assetWeight] = entry;
    const access = Math.max(
      ...supplyLines.map(sl => sl.accessScores[assetId] || 0),
      0
    );
    return access * assetWeight;
  });
  const impact =
    dependencyScore + accessScores.reduce((acc, val) => acc + val, 0);
  // const oldImpact = Math.max(...supplyLines.map(sl => sl.score), 0);
  // console.log({ impact, oldImpact });
  return impact;
}

function getMaxScore(questions, questionType) {
  let maxScore = 0;
  questions
    .filter(q => q["Type of question"] === questionType)
    .forEach(question => {
      maxScore +=
        Math.max.apply(
          Math,
          question.Answers.map(ans => {
            return ans.val;
          })
        ) * (question.Weight || 1);
    });

  return maxScore;
}

// Access questions tied to specific assets
function getMaxAccessScore(questions, assetId) {
  let maxScore = 0;
  questions
    .filter(
      q =>
        q["Type of question"] === "Access" &&
        getCellMultiples(q["Asset ID"]).indexOf(assetId) !== -1
    )
    .forEach(question => {
      maxScore +=
        Math.max.apply(
          Math,
          question.Answers.map(ans => {
            return ans.val;
          })
        ) * (question.Weight || 1);
    });

  return maxScore;
}
